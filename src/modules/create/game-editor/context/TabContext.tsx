import React, { createContext, useContext } from 'react';

interface TabContextType {
  activeTab: string;
}

export const TabContext = createContext<TabContextType>({ activeTab: 'code' });

export const useTabContext = (): TabContextType => useContext(TabContext);
