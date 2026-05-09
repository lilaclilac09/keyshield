import React, { useState } from 'react';
import { Terminal, Eye, EyeOff, RotateCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { RevealField } from '../../components/ui/RevealField';
import { CodeBlock } from '../../components/ui/CodeBlock';
import { API_BASE, apiFetch, getToken, getWalletAddress, clearAuth, clearPasskeyTrust, notifyAuthChanged } from '../../lib/auth';