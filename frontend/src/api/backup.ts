import client from './client';

export const exportBackup = async (): Promise<void> => {
    try {
        const response = await client.get('/backup/export');
        // Client returns parsed JSON data directly if interceptor is set to return data,
        // but for Blob download we might need raw response or handle the data.

        // Assuming client returns JSON object:
        const data = response.data;
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        const date = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        link.download = `ER-PSScripter_SystemBackup_${date}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error("Export failed", error);
        throw error;
    }
};

export const importBackup = async (jsonData: unknown): Promise<void> => {
    try {
        await client.post('/backup/import', jsonData);
    } catch (error) {
        console.error("Import failed", error);
        throw error;
    }
};
