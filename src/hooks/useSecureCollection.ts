import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';

export function useSecureCollection(collectionName: string) {
  const { profile, isAdmin, isSuperAdmin, currentCompanyId } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentCompanyId || (!isAdmin && !isSuperAdmin && !profile?.permissions)) {
      setData([]);
      setLoading(false);
      return;
    }

    const baseConstraints: QueryConstraint[] = [
      where('companyId', '==', currentCompanyId)
    ];

    let unsubs: (() => void)[] = [];
    const allData = new Map<string, any>();

    const updateState = () => {
      // Apply strict client-side filtering according to user's permissions
      let sorted = Array.from(allData.values());
      
      if (!isSuperAdmin && !isAdmin) {
         sorted = sorted.filter(doc => {
            if (!doc.shop) return false;
            const shopPerm = profile?.permissions?.find((p: any) => p.shop === doc.shop);
            if (!shopPerm) return false;
            if (shopPerm.canViewPast) return true;
            
            // For products we use uploadTime or createdAt
            // For plannings we use createdAt
            const docDateStr = doc.uploadTime || doc.createdAt || 0;
            const docDate = new Date(docDateStr);
            const takeoverDate = new Date(shopPerm.takeoverTime);
            return docDate >= takeoverDate;
         });
      }

      setData(sorted);
      setLoading(false);
    };

    const handleSnapshot = (snapshot: any, chunkIndex: number) => {
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'removed') {
          allData.delete(change.doc.id);
        } else {
          allData.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
        }
      });
      updateState();
    };

    if (isAdmin || isSuperAdmin) {
      const q = query(collection(db, collectionName), ...baseConstraints);
      unsubs.push(onSnapshot(q, (snap) => handleSnapshot(snap, 0)));
    } else {
      const allowedShops = profile?.permissions?.map((p: any) => p.shop) || [];
      if (allowedShops.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }
      
      const chunks = [];
      for (let i = 0; i < allowedShops.length; i += 30) {
        chunks.push(allowedShops.slice(i, i + 30));
      }

      chunks.forEach((chunk, index) => {
        const q = query(collection(db, collectionName), ...baseConstraints, where('shop', 'in', chunk));
        unsubs.push(onSnapshot(q, (snap) => handleSnapshot(snap, index)));
      });
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [collectionName, currentCompanyId, isAdmin, isSuperAdmin, profile]);

  return { data, loading };
}
