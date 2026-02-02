import asyncio
import contextlib
import fcntl
import logging
import os
import pty
import select
import shutil
import struct
import subprocess
import tempfile
import termios

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/terminal")
async def terminal_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    
    # Master and Slave file descriptors for PTY
    master_fd, slave_fd = pty.openpty()

    # Disable default echo on the slave PTY because pwsh/PSReadLine handles its own echoing/highlighting.
    # If we leave this on, we get double characters (one from kernel TTY, one from shell).
    attrs = termios.tcgetattr(slave_fd)
    attrs[3] = attrs[3] & ~termios.ECHO
    termios.tcsetattr(slave_fd, termios.TCSANOW, attrs)
    
    # Create a temporary directory for the session (Sandboxing)
    session_tmp_dir = tempfile.mkdtemp(prefix="psscripter_session_")
    logger.info(f"Created temp session dir: {session_tmp_dir}")

    # Spawn the shell process (pwsh)
    process = None
    reader_task = None

    try:
        # Prepare environment: Override HOME to isolate modules/config
        # We inherit existing env but override HOME
        env = os.environ.copy()
        env["HOME"] = session_tmp_dir
        env["TERM"] = "xterm-256color"
        env["LANG"] = "en_US.UTF-8"

        process = subprocess.Popen(
            ["pwsh", "-NoLogo", "-NoProfile"],
            preexec_fn=os.setsid,  # Create a new session
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=session_tmp_dir, # Start in temp dir
            env=env
        )
        # Close slave fd in parent process as it's now owned by child
        os.close(slave_fd)
        
        logger.info(f"Terminal session started. PID: {process.pid}")

        # Async loop to read from PTY and send to WebSocket
        async def read_from_pty() -> None:
            try:
                while True:
                    await asyncio.sleep(0.01) # Yield control
                    
                    # Check if PTY has data to read
                    # We use select for non-blocking check or run in executor
                    # Since we are in async, blocking read on fd is bad.
                    # We can use loop.add_reader, but let's try a simple polling with select first
                    # for simplicity inside async wrapper
                    # or use run_in_executor for the blocking os.read
                    
                    # Simpler approach: asyncio.to_thread for blocking read
                    # Note: os.read blocks.
                    
                    try:
                        # Non-blocking check
                        r, w, x = select.select([master_fd], [], [], 0)
                        if master_fd in r:
                            data = os.read(master_fd, 10240)
                            if not data:
                                break
                            # Send text to websocket
                            try:
                                await websocket.send_text(data.decode('utf-8', errors='replace'))
                            except Exception as e:
                                logger.warning(f"Failed to send to WS: {e}")
                                break
                    except OSError:
                        break
                        
                    # Check if process is still alive
                    if process.poll() is not None:
                        break
            except Exception as e:
                logger.error(f"Error reading from PTY: {e}")
            finally:
                logger.info("Stopped reading from PTY")

        # Start the reader task
        reader_task = asyncio.create_task(read_from_pty())
        
        try:
            while True:
                # Receive input from WebSocket (from user typing in xterm.js)
                message = await websocket.receive_text()
                
                # Check for resize command (custom protocol: "resize:COLS:ROWS")
                if message.startswith("resize:"):
                    try:
                        _, cols, rows = message.split(":")
                        # Set terminal window size
                        winsize = struct.pack("HHHH", int(rows), int(cols), 0, 0)
                        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                        continue
                    except Exception as e:
                        logger.warning(f"Resize failed: {e}")
                        continue

                # Write user input to PTY
                # Ensure it's bytes
                os.write(master_fd, message.encode('utf-8'))
                
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected")
        except Exception as e:
             logger.error(f"WebSocket error: {e}")

    except Exception as e:
        logger.error(f"Failed to start terminal: {e}")
        await websocket.close()
    finally:
        # Cleanup
        logger.info("Cleaning up terminal session...")
        if reader_task:
            reader_task.cancel()
        
        if process:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
        
        # Close master fd if open
        with contextlib.suppress(OSError):
            os.close(master_fd)

        # Cleanup Temp Dir
        if os.path.exists(session_tmp_dir):
            try:
                shutil.rmtree(session_tmp_dir)
                logger.info(f"Removed temp session dir: {session_tmp_dir}")
            except Exception as e:
                logger.error(f"Failed to remove temp dir: {e}")
