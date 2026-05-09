import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { apiFetch, getToken, getWalletAddress, getPasskeyTrust } from '../../lib/auth';
import { relTime } from '../../lib/time';