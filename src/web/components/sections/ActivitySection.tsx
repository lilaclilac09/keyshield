import React from 'react';
import { SpendWorkspace } from './SpendWorkspace';

/** Spend summary. The workspace also hosts breakdown, calls, plans, streams, and balance. */
export const ActivitySection: React.FC = () => <SpendWorkspace initial="summary" />;
