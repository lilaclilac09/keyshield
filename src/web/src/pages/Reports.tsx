import { useState, useEffect } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@keyshield/ui';
import { ReportPage, type LogType } from '../components/ReportPage';

export default function Reports() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#f8f8f8' }}>Reports</h1>
          <p className="page-header-subtitle">Vault audit logs and activity reports</p>
        </div>
      </div>

      <ReportPage />
    </div>
  );
}
