import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const APPS_SCRIPT_URL = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;

export interface SheetSyncData {
  type: 'job' | 'transaction';
  action: 'create' | 'update' | 'delete';
  data: any;
}

export const googleSheetsService = {
  async getUserSheetConfig(userId: string) {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return userDoc.data().googleSheetsConfig;
    }
    return null;
  },

  async saveUserSheetConfig(userId: string, config: { spreadsheetId: string; spreadsheetUrl: string } | null) {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { googleSheetsConfig: config }, { merge: true });
  },

  async disconnectUserSheet(userId: string) {
    await this.saveUserSheetConfig(userId, null);
  },

  async initializeUserSheet(userEmail: string, userId: string, userName: string, forceNew: boolean = false) {
    if (!APPS_SCRIPT_URL) {
      console.warn('Google Apps Script URL not configured');
      return null;
    }

    try {
      // If forceNew is true, we append a timestamp to the userId so the Apps Script 
      // doesn't find the old deleted sheet in its PropertiesService and creates a new one.
      const effectiveUserId = forceNew ? `${userId}_${Date.now()}` : userId;

      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          action: 'initUser',
          userEmail,
          userId: effectiveUserId,
          userName,
        }),
      });

      if (!response.ok) throw new Error('Failed to initialize sheet');
      const text = await response.text();
      try {
        const result = JSON.parse(text);
        if (result.error) throw new Error(result.error);
        return {
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.url
        };
      } catch (e) {
        console.error('Failed to parse Apps Script response:', text);
        throw new Error(e instanceof Error ? e.message : 'Invalid response from Google Sheets service');
      }
    } catch (error) {
      console.error('Error initializing Google Sheet:', error);
      throw error;
    }
  },

  async syncData(spreadsheetId: string, syncData: SheetSyncData): Promise<{success: boolean, error?: string}> {
    if (!APPS_SCRIPT_URL || !spreadsheetId) return { success: false, error: 'Missing URL or ID' };

    try {
      const payload = {
        action: syncData.action,
        spreadsheetId,
        type: syncData.type,
        data: syncData.data,
      };
      console.log('Sending syncData payload:', payload);

      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        console.error('Apps Script responded with status:', response.status);
        return { success: false, error: `HTTP Error: ${response.status}` };
      }
      
      const text = await response.text();
      console.log('Apps Script response:', text);
      try {
        const result = JSON.parse(text);
        if (result.error) {
           console.error('Apps Script returned error:', result.error);
           
           // Auto-recovery for deleted sheets
           if (result.error.toLowerCase().includes('missing') || result.error.toLowerCase().includes('deleted')) {
             if (auth.currentUser && auth.currentUser.email) {
               console.log('Attempting auto-recovery for deleted sheet...');
               const userName = auth.currentUser.displayName || auth.currentUser.email.split('@')[0] || 'User';
               const newSheetResult = await this.initializeUserSheet(auth.currentUser.email, auth.currentUser.uid, userName, true);
               
               if (newSheetResult && newSheetResult.spreadsheetId) {
                 // Save new config
                 await this.saveUserSheetConfig(auth.currentUser.uid, {
                   spreadsheetId: newSheetResult.spreadsheetId,
                   spreadsheetUrl: newSheetResult.spreadsheetUrl
                 });
                 
                 // Retry sync with new ID
                 payload.spreadsheetId = newSheetResult.spreadsheetId;
                 const retryResponse = await fetch(APPS_SCRIPT_URL, {
                   method: 'POST',
                   headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                   body: JSON.stringify(payload),
                 });
                 
                 if (retryResponse.ok) {
                   const retryText = await retryResponse.text();
                   const retryResult = JSON.parse(retryText);
                   if (!retryResult.error) {
                     return { success: true };
                   }
                 }
               }
             }
           }
           
           return { success: false, error: result.error };
        }
        return { success: true };
      } catch (e) {
        if (e instanceof Error && e.message !== 'Failed to parse response') {
          console.error('Auto-recovery failed:', e);
          return { success: false, error: 'Auto-recovery failed: ' + e.message };
        }
        console.error('Failed to parse Apps Script response as JSON:', text);
        return { success: false, error: 'Failed to parse response' };
      }
    } catch (error) {
      console.error('Error syncing to Google Sheets:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async syncAllData(spreadsheetId: string, jobs: any[], transactions: any[]): Promise<{success: boolean, error?: string}> {
    if (!APPS_SCRIPT_URL || !spreadsheetId) return { success: false, error: 'Missing URL or ID' };

    try {
      const payload = {
        action: 'syncAll',
        spreadsheetId,
        jobs,
        transactions,
      };
      
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        return { success: false, error: `HTTP Error: ${response.status}` };
      }
      
      const text = await response.text();
      try {
        const result = JSON.parse(text);
        if (result.error) {
           console.error('Apps Script returned error:', result.error);
           
           // Auto-recovery for deleted sheets
           if (result.error.toLowerCase().includes('missing') || result.error.toLowerCase().includes('deleted')) {
             if (auth.currentUser && auth.currentUser.email) {
               console.log('Attempting auto-recovery for deleted sheet...');
               const userName = auth.currentUser.displayName || auth.currentUser.email.split('@')[0] || 'User';
               const newSheetResult = await this.initializeUserSheet(auth.currentUser.email, auth.currentUser.uid, userName, true);
               
               if (newSheetResult && newSheetResult.spreadsheetId) {
                 // Save new config
                 await this.saveUserSheetConfig(auth.currentUser.uid, {
                   spreadsheetId: newSheetResult.spreadsheetId,
                   spreadsheetUrl: newSheetResult.spreadsheetUrl
                 });
                 
                 // Retry sync with new ID
                 payload.spreadsheetId = newSheetResult.spreadsheetId;
                 const retryResponse = await fetch(APPS_SCRIPT_URL, {
                   method: 'POST',
                   headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                   body: JSON.stringify(payload),
                 });
                 
                 if (retryResponse.ok) {
                   const retryText = await retryResponse.text();
                   const retryResult = JSON.parse(retryText);
                   if (!retryResult.error) {
                     return { success: true };
                   }
                 }
               }
             }
           }
           
           return { success: false, error: result.error };
        }
        return { success: true };
      } catch (e) {
        if (e instanceof Error && e.message !== 'Failed to parse response') {
          console.error('Auto-recovery failed:', e);
          return { success: false, error: 'Auto-recovery failed: ' + e.message };
        }
        return { success: false, error: 'Failed to parse response' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};
