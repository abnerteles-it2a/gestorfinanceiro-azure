import { S3Client } from '@aws-sdk/client-s3';

let s3Client: S3Client | null = null;

export const getS3Client = () => {
  if (s3Client) return s3Client;

  const region = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  } else {
    console.error('S3_CLIENT_INIT_FAILED', {
      hasRegion: !!region,
      hasAccessKey: !!accessKeyId,
      hasSecret: !!secretAccessKey
    });
  }
  return s3Client;
};

export const getBucketName = () => {
  return process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || '';
};

// Legacy exports for compatibility during refactor (though we will update consumer)
export { s3Client }; 
export const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || '';
