import React, { useState } from 'react';
import { DEVICE_VAULT_REQUIRED } from '../lib/device-save';
import { DeviceVaultSection } from './sections/DeviceVaultSection';

export const DeviceVaultConsent: React.FC<{ onUnlock?: () => void }> = ({ onUnlock }) => {
  const [showSetup, setShowSetup] = useState(false);
  return <div className="space-y-3 rounded-lg border border-[#243365] p-3" role="alert">
    <p className="text-[13px] text-[#a8b3d8]">{DEVICE_VAULT_REQUIRED}</p>
    <div className="flex gap-3 text-[13px]">
      {onUnlock && <button type="button" onClick={onUnlock} className="underline">Unlock device vault</button>}
      <button type="button" onClick={() => setShowSetup(!showSetup)} className="underline">Unlock or create device vault</button>
    </div>
    {showSetup && <DeviceVaultSection />}
  </div>;
};
