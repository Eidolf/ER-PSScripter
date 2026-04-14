import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProject, getProjectStructure, type Project, type ProjectFolder } from '../api/projects';
import { createSnippet, deleteSnippet, type SnippetCreate } from '../api/snippets';

const FolderIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clipRule="evenodd" />
        <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
    </svg>
);

const FileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H8z" clipRule="evenodd" />
    </svg>
);

import { deleteProjectFolder } from '../api/projects';

// ... (FolderIcon and FileIcon remain the same) ...

interface FolderViewProps {
    folder: ProjectFolder;
    path: string;
    onAddFile: (path: string) => void;
    onDeleteFile: (id: number) => void;
    onDeleteFolder: (path: string) => void;
    onUploadToFolder: (path: string) => void;
}

function FolderView({ folder, path, onAddFile, onDeleteFile, onDeleteFolder, onUploadToFolder }: FolderViewProps) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="pl-4">
            <div className="flex items-center py-1 group">
                <button onClick={() => setIsOpen(!isOpen)} className="focus:outline-none mr-1">
                    <svg className={`h-4 w-4 transform transition-transform ${isOpen ? 'rotate-90' : ''} text-gray-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
                <FolderIcon />
                <span className="font-medium text-gray-700 dark:text-gray-300">{folder.name}</span>

                {/* File/Folder Actions */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2 transition-opacity">
                    <button
                        onClick={() => onAddFile(path)}
                        className="text-xs bg-gray-200 dark:bg-gray-700 px-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                        title="Add File"
                    >
                        + File
                    </button>
                    <button
                        onClick={() => onUploadToFolder(path)}
                        className="text-xs bg-green-100 dark:bg-green-900 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-1 rounded hover:bg-green-200 dark:hover:bg-green-800"
                        title="Upload Here"
                    >
                        ↑ Upload
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteFolder(path); }}
                        className="text-xs bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-1 rounded hover:bg-red-200 dark:hover:bg-red-800"
                        title="Delete Folder"
                    >
                        🗑
                    </button>
                </div>
            </div>
            {isOpen && (
                <div className="border-l border-gray-200 dark:border-gray-700 ml-2">
                    {folder.folders.map((sub, idx) => (
                        <FolderView
                            key={idx}
                            folder={sub}
                            path={`${path}/${sub.name}`}
                            onAddFile={onAddFile}
                            onDeleteFile={onDeleteFile}
                            onDeleteFolder={onDeleteFolder}
                            onUploadToFolder={onUploadToFolder}
                        />
                    ))}
                    {folder.files.map((file, idx) => (
                        <div key={idx} className="pl-6 flex items-center justify-between py-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer group pr-2">
                            <div className="flex items-center">
                                <FileIcon />
                                <span className="text-gray-600 dark:text-gray-400">{file.name}</span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteFile(file.snippet_id); }}
                                className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete File"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ProjectDetail() {
    const { id } = useParams<{ id: string }>();
    const [project, setProject] = useState<Project | null>(null);
    const [structure, setStructure] = useState<ProjectFolder | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAddFileModalOpen, setIsAddFileModalOpen] = useState(false);
    const [selectedPath, setSelectedPath] = useState('');
    const [newFileName, setNewFileName] = useState('');
    const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);

    useEffect(() => {
        if (id) loadProject(parseInt(id));
    }, [id]);

    const loadProject = async (projectId: number) => {
        setLoading(true);
        try {
            const projData = await getProject(projectId);
            setProject(projData);
            const structData = await getProjectStructure(projectId);
            setStructure(structData);
        } catch (error) {
            console.error('Failed to load project', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddFile = (path: string) => {
        setSelectedPath(path);
        setNewFileName('');
        setIsAddFileModalOpen(true);
    };

    const submitAddFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project || !id) return;

        try {
            // Calculate relative path for backend
            // path is like "ProjectName/SubFolder", we need relative to root which is just "SubFolder"
            // actually structure root name is Project Name.
            // If selectedPath is "ProjectName", relative path is "".
            // If selectedPath is "ProjectName/src", relative path is "src".

            let relativePath = "";
            const projectRootName = structure?.name || "";
            if (selectedPath.startsWith(projectRootName + "/")) {
                relativePath = selectedPath.substring(projectRootName.length + 1);
            } else if (selectedPath === projectRootName) {
                relativePath = "";
            }

            // Append new file path
            const fullRelativePath = relativePath ? `${relativePath}/${newFileName}` : newFileName;

            const newSnippet: SnippetCreate = {
                name: newFileName,
                content: "# New Script",
                tags: ["project-file"],
                project_id: parseInt(id),
                relative_path: fullRelativePath
            };

            await createSnippet(newSnippet);
            setIsAddFileModalOpen(false);
            loadProject(parseInt(id));
        } catch (error) {
            console.error("Failed to create file", error);
        }
    };

    const uploadTargetPathRef = useRef('');

    const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !id || !structure) return;

        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setLoading(true);

        try {
            let successCount = 0;
            let failCount = 0;
            const emptyCount = 0;
            const currentTargetPath = uploadTargetPathRef.current;

            console.log(`Starting upload. Target Path: "${currentTargetPath}". Files: ${files.length}`);

            let targetPrefix = "";
            const projectRootName = structure.name;

            if (currentTargetPath.startsWith(projectRootName + "/")) {
                targetPrefix = currentTargetPath.substring(projectRootName.length + 1);
            } else if (currentTargetPath === projectRootName) {
                targetPrefix = "";
            }

            console.log(`Calculated target prefix: "${targetPrefix}"`);

            for (const file of files) {
                // Skip system files
                if (file.name.startsWith('.')) {
                    continue;
                }

                // Removed 0-byte check to allow debugging of virtual files

                try {
                    let text = "";
                    if (file.size > 0) {
                        text = await readFileContent(file);
                    } else {
                        console.log(`Processing 0-byte file: ${file.name}`);
                    }

                    let finalPath = file.webkitRelativePath || file.name;
                    if (targetPrefix) {
                        finalPath = `${targetPrefix}/${finalPath}`;
                    }

                    await createSnippet({
                        name: file.name,
                        content: text,
                        tags: ["project-file"],
                        project_id: parseInt(id),
                        relative_path: finalPath
                    });
                    successCount++;
                } catch (readError) {
                    console.warn(`Failed to process file ${file.name} (${file.size} bytes). Error:`, readError);
                    failCount++;
                }
            }

            let msg = `Upload complete.\nUploaded: ${successCount}`;
            if (emptyCount > 0) msg += `\nSkipped (Empty/Folders): ${emptyCount}`;
            if (failCount > 0) msg += `\nFailed: ${failCount}`;

            console.log(msg);
            alert(msg);

            await loadProject(parseInt(id));
        } catch (error) {
            console.error("Critical upload error", error);
            alert("Failed to execute upload process: " + error);
        } finally {
            setLoading(false);
            if (e.target) e.target.value = '';
        }
    };

    const readFileContent = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string || "");
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    };

    const handleDeleteFile = async (snippetId: number) => {
        if (!confirm("Are you sure you want to delete this file?")) return;
        try {
            await deleteSnippet(snippetId);
            if (id) loadProject(parseInt(id));
        } catch (error) {
            console.error("Failed to delete file", error);
            alert("Failed to delete file");
        }
    };

    const handleDeleteFolder = async (folderPath: string) => {
        if (!id) return;

        // folderPath is like "ProjectName/SubFolder"
        // API expects relative path from project root, so "SubFolder"
        const projectRootName = structure?.name || "";
        let relativePath = "";

        if (folderPath.startsWith(projectRootName + "/")) {
            relativePath = folderPath.substring(projectRootName.length + 1);
        } else if (folderPath === projectRootName) {
            alert("Cannot delete the root folder.");
            return;
        } else {
            // Fallback or error
            relativePath = folderPath;
        }

        if (!confirm(`Are you sure you want to delete folder "${relativePath}" and ALL its contents? This cannot be undone.`)) return;

        try {
            await deleteProjectFolder(parseInt(id), relativePath);
            await loadProject(parseInt(id));
        } catch (error) {
            console.error("Failed to delete folder", error);
            alert("Failed to delete folder.");
        }
    };

    const handleUploadToFolder = (path: string) => {
        uploadTargetPathRef.current = path;
        // Trigger the file input click
        const input = document.getElementById('folder-upload-input');
        if (input) {
            input.click();
        } else {
            alert("Upload input not found");
        }
    };

    const handleAddFolder = () => {
        setNewFileName(''); // Reuse this for folder name
        setIsAddFolderModalOpen(true);
    };

    const submitAddFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!project || !id) return;

        try {
            // Create a .keep file to persist the folder
            const folderName = newFileName; // Reusing state variable
            const relativePath = selectedPath ? `${selectedPath}/${folderName}` : folderName;

            await createSnippet({
                name: ".keep",
                content: "",
                tags: ["project-file", "hidden"],
                project_id: parseInt(id),
                relative_path: `${relativePath}/.keep`
            });

            setIsAddFolderModalOpen(false);
            loadProject(parseInt(id));
        } catch (error) {
            console.error("Failed to create folder", error);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading project...</div>;
    if (!project || !structure) return <div className="p-8 text-center text-red-500">Project not found</div>;

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-6">
                <Link to="/projects" className="text-blue-600 hover:underline mb-2 inline-block">← Back to Projects</Link>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">{project.description}</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4 border-b pb-2 border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold dark:text-white">Project Structure</h2>
                    <div className="flex gap-2">
                        {/* Hidden input triggered by buttons */}
                        <input
                            id="folder-upload-input"
                            type="file"
                            // @ts-expect-error - standard
                            webkitdirectory=""
                            directory=""
                            multiple
                            className="hidden"
                            onChange={handleFolderUpload}
                        />

                        <button
                            onClick={() => handleUploadToFolder(structure.name)} // Upload to root of project
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded cursor-pointer text-sm transition-colors"
                        >
                            Upload Folder
                        </button>
                        <button
                            onClick={handleAddFolder}
                            className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                            + New Folder
                        </button>
                        <button
                            onClick={() => handleAddFile("")}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                            + New File
                        </button>
                    </div>
                </div>
                <FolderView
                    folder={structure}
                    path={structure.name}
                    onAddFile={handleAddFile}
                    onDeleteFile={handleDeleteFile}
                    onDeleteFolder={handleDeleteFolder}
                    onUploadToFolder={handleUploadToFolder}
                />
            </div>

            {/* Add File Modal */}
            {isAddFileModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6">
                        <h2 className="text-xl font-bold mb-4 dark:text-white">Add New File</h2>
                        <div className="mb-4">
                            <label className="block text-gray-700 dark:text-gray-300 mb-2">Location (Folder)</label>
                            <input
                                type="text"
                                className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                value={selectedPath}
                                onChange={(e) => setSelectedPath(e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-1">Relative to project root. Leave empty for root.</p>
                        </div>
                        <form onSubmit={submitAddFile}>
                            <div className="mb-4">
                                <label className="block text-gray-700 dark:text-gray-300 mb-2">File Name (e.g. Script.ps1)</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={newFileName}
                                    onChange={(e) => setNewFileName(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddFileModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Create File
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Folder Modal */}
            {isAddFolderModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6">
                        <h2 className="text-xl font-bold mb-4 dark:text-white">Add New Folder</h2>
                        <div className="mb-4">
                            <label className="block text-gray-700 dark:text-gray-300 mb-2">Parent Folder</label>
                            <input
                                type="text"
                                className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                value={selectedPath}
                                onChange={(e) => setSelectedPath(e.target.value)}
                                placeholder="Leave empty for root"
                            />
                        </div>
                        <form onSubmit={submitAddFolder}>
                            <div className="mb-4">
                                <label className="block text-gray-700 dark:text-gray-300 mb-2">Folder Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={newFileName}
                                    onChange={(e) => setNewFileName(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddFolderModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                                >
                                    Create Folder
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
