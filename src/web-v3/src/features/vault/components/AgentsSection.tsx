import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, StatCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { apiFetch } from '../../lib/auth';