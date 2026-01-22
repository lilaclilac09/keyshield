# Google AI (Gemini) Integration Guide

## 🚀 Quick Setup

### Step 1: Get Your Google AI API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

### Step 2: Add API Key to Environment

Add your API key to `frontend/.env.local`:

```bash
NEXT_PUBLIC_GOOGLE_AI_API_KEY=your_api_key_here
```

### Step 3: Restart Dev Server

```bash
cd frontend
# Stop the current server (Ctrl+C)
npm run dev
```

### Step 4: Connect in the App

1. Open http://localhost:3000
2. Connect your wallet
3. You'll see the "Google AI (Gemini)" connector card
4. Click "Connect Google AI" and enter your API key
5. The status will show "Connected to Google AI" when successful

## ✨ Features

Once connected, Google AI provides:

### 1. **Security Analysis**
- Analyzes your vault configuration
- Detects potential security threats
- Provides risk assessment (low/medium/high)
- Suggests security improvements

### 2. **Key Rotation Recommendations**
- Analyzes key age and usage
- Recommends when to rotate keys
- Provides priority levels
- Explains rotation reasons

### 3. **Access Control Recommendations**
- Reviews active key shares
- Suggests access control improvements
- Recommends time-locked access
- Suggests ZK proof usage

### 4. **AI Chat Assistant**
- Ask questions about vault management
- Get security advice
- Learn about best practices
- Get help with key operations

## 📝 Usage Examples

### Using the Hook

```typescript
import { useAIAgent } from '@/hooks/useAIAgent';

function MyComponent() {
  const {
    isGoogleAIConnected,
    analyzeSecurity,
    getRotationRecommendation,
    chat,
  } = useAIAgent();

  // Analyze vault security
  const handleAnalyze = async () => {
    const analysis = await analyzeSecurity({
      owner: 'your_wallet_address',
      createdAt: Date.now() / 1000,
      accessFlags: 0,
      shareCount: 2,
    });
    console.log('Threats:', analysis.threats);
    console.log('Risk Level:', analysis.riskLevel);
  };

  // Get rotation recommendation
  const handleRotation = async () => {
    const recommendation = await getRotationRecommendation({
      keyName: 'My API Key',
      createdAt: Date.now() / 1000 - 100 * 24 * 60 * 60, // 100 days ago
      accessCount: 50,
    });
    console.log('Should rotate:', recommendation.shouldRotate);
  };

  // Chat with AI
  const handleChat = async () => {
    const response = await chat(
      'How do I secure my API keys?',
      { vaultOwner: 'your_address', hasVault: true }
    );
    console.log('AI Response:', response);
  };
}
```

## 🔒 Security Notes

- **API Key Storage**: The API key is stored in environment variables
- **Client-Side**: The key is exposed to the client (required for Next.js `NEXT_PUBLIC_*` vars)
- **Production**: For production, consider using a backend API to proxy requests
- **Rate Limits**: Google AI has rate limits - be mindful of usage

## 🛠️ Troubleshooting

### "Google AI is not connected"
- Check that `NEXT_PUBLIC_GOOGLE_AI_API_KEY` is set in `.env.local`
- Restart the dev server after adding the key
- Verify the API key is correct

### "Failed to get AI response"
- Check your API key is valid
- Verify you have API access enabled
- Check browser console for detailed errors

### API Key Not Working
- Make sure you copied the full key
- Check for extra spaces or characters
- Verify the key is active in Google AI Studio

## 📚 API Reference

### `useAIAgent()` Hook

Returns:
- `isGoogleAIConnected: boolean` - Connection status
- `agentStatus: 'idle' | 'monitoring' | 'active' | 'error'` - Current status
- `error: string | null` - Error message if any
- `threats: Threat[]` - Detected threats
- `analyzeSecurity(vaultData)` - Analyze vault security
- `getRotationRecommendation(keyMetadata)` - Get rotation advice
- `getAccessRecommendations(shares)` - Get access control tips
- `chat(message, context)` - Chat with AI

## 🎯 Next Steps

1. Connect your API key
2. Try the security analysis feature
3. Ask the AI questions about vault management
4. Use recommendations to improve your security

---

**Need Help?** Check the [Google AI Documentation](https://ai.google.dev/docs)
