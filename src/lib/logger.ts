import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE';
export type EntityType = 'PLANNING' | 'PRODUCT' | 'USER' | 'SETTING' | 'SYSTEM';

export const logOperation = async (
  action: ActionType,
  entity: EntityType,
  entityId: string,
  details: string,
  profile: any
) => {
  try {
    if (!profile) return;
    
    await addDoc(collection(db, 'logs'), {
      action,
      entity,
      entityId,
      details,
      operatorId: profile.uid,
      operatorName: profile.displayName || profile.username || 'Unknown',
      companyId: profile.companyId || 'HQ',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log operation:', error);
  }
};
