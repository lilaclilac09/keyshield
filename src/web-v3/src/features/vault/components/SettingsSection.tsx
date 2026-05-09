import React, { useState, useEffect, useCallback } from 'react';
import { Key, Fingerprint, RefreshCw, Trash2, Shield, Bell, BellOff } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { apiFetch, clearAuth, clearPasskeyTrust, notifyAuthChanged, getPasskeyTrust, registerPasskey, listPasskeys, deletePasskey, setPasskeyTrust } from '../../lib/auth';