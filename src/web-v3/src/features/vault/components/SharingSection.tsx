import React, { useState, useEffect, useCallback } from 'react';
import { Share2, ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { apiFetch } from '../../lib/auth';
import { grantShare, revokeShare, listIncomingShares, listOutgoingShares, type ShareRow } from '../../lib/api';