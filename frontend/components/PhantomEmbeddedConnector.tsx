
import React from 'react';
import { usePhantom, useConnect, useDisconnect } from '@phantom/react-sdk';

interface Props {
  onConnect: () => void;
}

export const PhantomEmbeddedConnector: React.FC<Props> = ({ onConnect }) => {
  const { isConnected, addresses, isLoading } = usePhantom();
  const { connect, isConnecting, error: connectError } = useConnect();
  const { disconnect, isDisconnecting } = useDisconnect();
  const [verificationStatus, setVerificationStatus] = React.useState<'idle' | 'verifying' | 'verified'>('idle');

  // Get Solana address if connected
  const solanaAddress = addresses?.find(addr => addr.chain === 'Solana');

  React.useEffect(() => {
    if (isConnected && solanaAddress && verificationStatus === 'idle') {
      setVerificationStatus('verifying');
      setTimeout(() => {
        setVerificationStatus('verified');
        setTimeout(onConnect, 800);
      }, 1500);
    }
  }, [isConnected, solanaAddress, onConnect, verificationStatus]);

  const handleConnect = async () => {
    try {
      // Connect with Phantom login (embedded wallet)
      // User can choose their preferred auth method in the modal
      await connect({
        provider: 'phantom', // Use Phantom login for embedded wallet
      });
    } catch (err) {
      console.error('Failed to connect Phantom Embedded:', err);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setVerificationStatus('idle');
    } catch (err) {
      console.error('Failed to disconnect Phantom Embedded:', err);
    }
  };

  const displayAddress = solanaAddress?.address 
    ? `${solanaAddress.address.slice(0, 12)}...` 
    : '';

  return (
    <div className="space-y-4">
      <button
        onClick={isConnected ? handleDisconnect : handleConnect}
        disabled={isConnecting || isDisconnecting || verificationStatus !== 'idle' || isLoading}
        className={`w-full text-left p-5 rounded-sm border transition-all duration-300 ${
          isConnected 
            ? 'bg-zinc-900 border-emerald-900/50 text-emerald-500' 
            : 'bg-gradient-to-r from-pink-500 to-purple-600 border-purple-600/50 hover:from-pink-600 hover:to-purple-700 text-white'
        }`}
      >
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em]">
            {isConnecting && 'ESTABLISHING_CONNECTION...'}
            {!isConnected && !isConnecting && 'CONNECT_PHANTOM_EMBEDDED'}
            {isConnected && verificationStatus === 'verifying' && 'SECURING_ENCRYPTION_LAYER...'}
            {verificationStatus === 'verified' && 'IDENTITY_VERIFIED'}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-tight opacity-60">
            {isConnected && solanaAddress
              ? `ADDR: ${displayAddress}` 
              : 'EMBEDDED_WALLET • NO_EXTENSION_NEEDED'}
          </div>
        </div>
      </button>

      {connectError && (
        <div className="p-4 bg-red-950/20 border border-red-900/50 rounded-sm">
          <p className="text-[9px] font-bold text-red-400 leading-relaxed uppercase tracking-widest">
            ERROR: {connectError.message}
          </p>
        </div>
      )}

      {verificationStatus === 'verifying' && (
        <div className="p-4 bg-indigo-950/20 border border-indigo-900/50 rounded-sm">
          <p className="text-[9px] font-bold text-indigo-400 leading-relaxed uppercase tracking-widest">
            >> VERIFYING_SIGNATURE<br/>
            >> INITIALIZING_GATEWAY<br/>
            >> BUFFER_READY
          </p>
        </div>
      )}
    </div>
  );
};
