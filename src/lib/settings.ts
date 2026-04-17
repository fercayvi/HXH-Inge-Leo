import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useState, useEffect } from 'react';
import { PlantSettings } from '../types';
import { LINES, STATUS_FACTORS, MAX_PRODUCTION, DEFAULT_PRODUCTS } from '../constants';

const DEFAULT_SETTINGS: PlantSettings = {
  lines: LINES,
  productConfigs: DEFAULT_PRODUCTS,
  statusFactors: STATUS_FACTORS,
  maxProduction: MAX_PRODUCTION
};

export function useSettings() {
  const [settings, setSettings] = useState<PlantSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'global');
    
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          ...DEFAULT_SETTINGS,
          ...data
        } as PlantSettings);
      } else {
        // If it doesn't exist, we use the default settings
        setSettings(DEFAULT_SETTINGS);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { settings, loading };
}

export async function updateSettings(newSettings: PlantSettings) {
  const settingsRef = doc(db, 'settings', 'global');
  await setDoc(settingsRef, newSettings);
}
