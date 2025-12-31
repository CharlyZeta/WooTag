
// Simple obfuscation to prevent plain-text credentials in localStorage
// Note: This is NOT military-grade encryption. It relies on a hardcoded salt
// which is visible in the client bundle. Its purpose is to prevent casual
// inspection of localStorage.

const SALT = 'WooTag-Secure-Salt-v1';

export const encrypt = (data: any): string => {
    try {
        const jsonString = JSON.stringify(data);
        // Combine with salt and base64 encode
        return btoa(jsonString + '::' + SALT);
    } catch (e) {
        console.error('Encryption failed', e);
        return '';
    }
};

export const decrypt = (encrypted: string): any | null => {
    try {
        // Base64 decode
        const decoded = atob(encrypted);
        // Split salt
        const [jsonString, salt] = decoded.split('::');

        if (salt !== SALT) {
            console.warn('Invalid salt in decrypted data');
            return null;
        }

        return JSON.parse(jsonString);
    } catch (e) {
        console.error('Decryption failed', e);
        return null;
    }
};
