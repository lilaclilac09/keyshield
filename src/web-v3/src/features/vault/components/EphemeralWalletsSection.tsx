import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { apiFetch } from '../../lib/auth';

interface EphemeralWallet { agent_id: string; pubkey: string; }