/**
 * Secure Storage Layer
 * Uses IndexedDB with Web Crypto API for encrypted storage
 */

interface SessionData {
  sessionToken: string;
  decryptedKeys: Map<string, string>;
  expiresAt: number;
}

interface VaultMetadata {
  vaultId: string;
  owner: string;
  domain: string;
  keyName: string;
  createdAt: number;
}

export class SecureStorage {
  private dbName = 'keyshield-storage';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  private encryptionKey: CryptoKey | null = null;

  /**
   * Initialize IndexedDB and encryption key
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.initEncryptionKey().then(resolve).catch(reject);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Session store
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }

        // Vault metadata store
        if (!db.objectStoreNames.contains('vaults')) {
          const vaultStore = db.createObjectStore('vaults', { keyPath: 'vaultId' });
          vaultStore.createIndex('domain', 'domain', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Ciphertext store - for storing full Lit Protocol ciphertexts
        if (!db.objectStoreNames.contains('ciphertexts')) {
          db.createObjectStore('ciphertexts', { keyPath: 'hash' });
        }
      };
    });
  }

  /**
   * Initialize or retrieve encryption key
   */
  private async initEncryptionKey(): Promise<void> {
    // Try to get existing key from storage
    const storedKey = await this.getSetting('encryptionKey');
    
    if (storedKey) {
      // Import existing key
      const keyData = new Uint8Array(Object.values(storedKey));
      this.encryptionKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    } else {
      // Generate new key
      this.encryptionKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      // Export and store
      const exported = await crypto.subtle.exportKey('raw', this.encryptionKey);
      await this.setSetting('encryptionKey', Array.from(new Uint8Array(exported)));
    }
  }

  /**
   * Encrypt data
   */
  private async encrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      dataBuffer
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt data
   */
  private async decrypt(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey!,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Store session data
   */
  async storeSession(sessionId: string, data: SessionData): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const encryptedToken = await this.encrypt(data.sessionToken);
    const sessionData = {
      id: sessionId,
      token: encryptedToken,
      expiresAt: data.expiresAt,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.put(sessionData);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(sessionId);

      request.onsuccess = async () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Check expiration
        if (result.expiresAt < Date.now()) {
          await this.deleteSession(sessionId);
          resolve(null);
          return;
        }

        try {
          const sessionToken = await this.decrypt(result.token);
          resolve({
            sessionToken,
            decryptedKeys: new Map(),
            expiresAt: result.expiresAt,
          });
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.delete(sessionId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store vault metadata
   */
  async storeVaultMetadata(metadata: VaultMetadata): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vaults'], 'readwrite');
      const store = transaction.objectStore('vaults');
      const request = store.put(metadata);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get vault metadata by domain
   */
  async getVaultsByDomain(domain: string): Promise<VaultMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vaults'], 'readonly');
      const store = transaction.objectStore('vaults');
      const index = store.index('domain');
      const request = index.getAll(domain);

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all vault metadata
   */
  async getAllVaults(): Promise<VaultMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vaults'], 'readonly');
      const store = transaction.objectStore('vaults');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store setting
   */
  async setSetting(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get setting
   */
  async getSetting(key: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.value || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store ciphertext with hash as key
   * @param hash - dataToEncryptHash from Lit Protocol (base64 string)
   * @param ciphertext - Full Lit Protocol ciphertext (base64 string)
   */
  async storeCiphertext(hash: string, ciphertext: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['ciphertexts'], 'readwrite');
      const store = transaction.objectStore('ciphertexts');
      
      const data = {
        hash,
        ciphertext,
        storedAt: Date.now(),
      };
      
      const request = store.put(data);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get ciphertext by hash
   * @param hash - dataToEncryptHash from Lit Protocol
   * @returns Full ciphertext string or null if not found
   */
  async getCiphertext(hash: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['ciphertexts'], 'readonly');
      const store = transaction.objectStore('ciphertexts');
      const request = store.get(hash);
      
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.ciphertext : null);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete ciphertext by hash
   * @param hash - dataToEncryptHash from Lit Protocol
   */
  async deleteCiphertext(hash: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['ciphertexts'], 'readwrite');
      const store = transaction.objectStore('ciphertexts');
      const request = store.delete(hash);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions', 'vaults', 'settings', 'ciphertexts'], 'readwrite');
      
      transaction.objectStore('sessions').clear();
      transaction.objectStore('vaults').clear();
      transaction.objectStore('settings').clear();
      transaction.objectStore('ciphertexts').clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
