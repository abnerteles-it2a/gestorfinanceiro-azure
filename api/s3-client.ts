import { BlobServiceClient } from '@azure/storage-blob';

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER || 'docs-vault';

let blobServiceClientInstance: BlobServiceClient | null = null;

export const getBlobServiceClient = (): BlobServiceClient | null => {
  if (blobServiceClientInstance) return blobServiceClientInstance;
  if (CONNECTION_STRING) {
    try {
      blobServiceClientInstance = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
    } catch (e) {
      console.warn('[Azure Storage] Falha ao inicializar BlobServiceClient:', e);
    }
  }
  return blobServiceClientInstance;
};

export const getContainerName = (): string => CONTAINER_NAME;
export const getBucketName = (): string => CONTAINER_NAME;

// Azure Storage Helper for Uploads and Reads
export async function getUploadUrl(pathname: string, contentType: string): Promise<string> {
  const client = getBlobServiceClient();
  if (!client) {
    // Return mock upload endpoint for local / staging without credentials
    return `/api/fiscal-docs/upload?mock=1&pathname=${encodeURIComponent(pathname)}`;
  }
  const containerClient = client.getContainerClient(CONTAINER_NAME);
  const blockBlobClient = containerClient.getBlockBlobClient(pathname);
  return blockBlobClient.url;
}

export async function getReadUrl(pathname: string): Promise<string> {
  const client = getBlobServiceClient();
  if (!client) {
    return pathname.startsWith('http') ? pathname : `/api/fiscal-docs/download?pathname=${encodeURIComponent(pathname)}`;
  }
  const containerClient = client.getContainerClient(CONTAINER_NAME);
  const blockBlobClient = containerClient.getBlockBlobClient(pathname);
  return blockBlobClient.url;
}

export async function deleteBlob(pathname: string): Promise<boolean> {
  const client = getBlobServiceClient();
  if (!client) return true;
  try {
    const containerClient = client.getContainerClient(CONTAINER_NAME);
    await containerClient.deleteBlob(pathname);
    return true;
  } catch (e) {
    console.warn('[Azure Storage] Erro ao deletar blob:', e);
    return false;
  }
}
