// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import * as HeapSnapshotWorker from './heap_snapshot_worker.js';
const dispatcher = new HeapSnapshotWorker.HeapSnapshotWorkerDispatcher.HeapSnapshotWorkerDispatcher(Platform.HostRuntime.HOST_RUNTIME.workerScope.postMessage.bind(Platform.HostRuntime.HOST_RUNTIME.workerScope));
Platform.HostRuntime.HOST_RUNTIME.workerScope.onmessage = dispatcher.dispatchMessage.bind(dispatcher);
Platform.HostRuntime.HOST_RUNTIME.workerScope.postMessage('workerReady');
//# sourceMappingURL=heap_snapshot_worker-entrypoint.js.map