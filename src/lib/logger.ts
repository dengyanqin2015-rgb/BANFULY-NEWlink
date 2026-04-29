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
  // Disabling cloud logging temporarily to save Firestore quota
  console.log(`[LOG] ${action} ${entity} ${entityId}: ${details}`, profile?.email);
  return;
  
  /* 
  try {
    if (!profile) return;
    ...
  */
};
