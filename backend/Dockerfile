# FROM python:3.11-slim as builder
# This is a distroless-like multi-stage build

FROM python:3.11-slim as requirements-stage

WORKDIR /tmp

RUN pip install poetry poetry-plugin-export
COPY ./pyproject.toml ./poetry.lock* /tmp/

RUN poetry export -f requirements.txt --output requirements.txt --without-hashes

FROM python:3.11-slim

WORKDIR /app

COPY --from=requirements-stage /tmp/requirements.txt /app/requirements.txt

# Install dependencies for PowerShell and other tools
# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Install PowerShell via binary
RUN wget https://github.com/PowerShell/PowerShell/releases/download/v7.4.1/powershell-7.4.1-linux-x64.tar.gz \
    && mkdir -p /opt/microsoft/powershell/7 \
    && tar zxf powershell-7.4.1-linux-x64.tar.gz -C /opt/microsoft/powershell/7 \
    && chmod +x /opt/microsoft/powershell/7/pwsh \
    && ln -s /opt/microsoft/powershell/7/pwsh /usr/bin/pwsh \
    && rm powershell-7.4.1-linux-x64.tar.gz

# Install CPU-only PyTorch first to avoid downloading huge GPU wheels
# Install CPU-only PyTorch first to avoid downloading huge GPU wheels
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Remove heavy GPU-related packages from requirements.txt before installing
# We also remove 'torch' from requirements.txt so pip doesn't try to "upgrade" it to the GPU version
RUN grep -vE "nvidia|triton|torch|cudnn" /app/requirements.txt > /app/requirements.cleaned.txt

# Install remaining requirements, forcing CPU index just in case
RUN pip install --no-cache-dir --upgrade -r /app/requirements.cleaned.txt --extra-index-url https://download.pytorch.org/whl/cpu

COPY ./app /app/app
COPY ./alembic.ini /app/alembic.ini
COPY ./alembic /app/alembic

COPY ./entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Non-root user for security
RUN useradd -m -u 1000 user
RUN mkdir -p /app/data
RUN chown -R user:user /app
USER user

CMD ["/app/entrypoint.sh"]
