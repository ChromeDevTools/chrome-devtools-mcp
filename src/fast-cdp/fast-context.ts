import type {Context} from '../tools/ToolDefinition.js';

export function getFastContext(): Context {
  return {
    isRunningPerformanceTrace: () => false,
    setIsRunningPerformanceTrace: () => {},
    recordedTraces: () => [],
    storeTraceRecording: () => {},
    getSelectedPage: () => {
      throw new Error('Fast context: no page');
    },
    getPages: () => [],
    createPagesSnapshot: async () => [],
    getDialog: () => undefined,
    clearDialog: () => {},
    getPageByIdx: () => {
      throw new Error('Fast context: no pages');
    },
    newPage: async () => {
      throw new Error('Fast context: newPage not supported');
    },
    closePage: async () => {
      throw new Error('Fast context: closePage not supported');
    },
    setSelectedPageIdx: () => {},
    getElementByUid: async () => {
      throw new Error('Fast context: getElementByUid not supported');
    },
    setNetworkConditions: () => {},
    setCpuThrottlingRate: () => {},
    saveTemporaryFile: async () => {
      throw new Error('Fast context: saveTemporaryFile not supported');
    },
    waitForEventsAfterAction: async () => {},
  };
}
