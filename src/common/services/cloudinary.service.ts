import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';


/**
 * Upload a buffer to Cloudinary
 * @param buffer The file buffer (e.g., from multer)
 * @param folder The folder name in Cloudinary
 * @param originalname Optional original filename to preserve extension
 * @returns Upload result containing the secure_url
 */
export const uploadToCloudinary = async (buffer: Buffer, folder: string = 'cle_du_memoire', originalname?: string): Promise<any> => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const options: any = { folder, resource_type: 'auto' };
    if (originalname) {
        // Cloudinary needs the extension in public_id for 'raw' files to serve them correctly with extensions
        // or we use original_filename if format is auto
        options.filename_override = originalname;
        options.use_filename = true;
        options.unique_filename = true;
        // For raw files without extension in public_id it strips it. So we pass it to public_id too if possible.
        // It's safer to just set resource_type: 'auto' and these filename flags
    }

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        const readableStream = new Readable({
            read() {
                this.push(buffer);
                this.push(null);
            },
        });

        readableStream.pipe(uploadStream);
    });
};
