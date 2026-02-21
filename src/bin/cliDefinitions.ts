/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ArgDef {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: string | number | boolean;
  enum?: ReadonlyArray<string | number>;
}
export type Commands = Record<
  string,
  {
    description: string;
    args: Record<string, ArgDef>;
  }
>;
export const commands: Commands = {
  click: {
    description: 'Clicks on the provided element',
    args: {
      uid: {
        name: 'uid',
        type: 'string',
        description:
          'The uid of an element on the page from the page content snapshot',
        required: true,
      },
      dblClick: {
        name: 'dblClick',
        type: 'boolean',
        description: 'Set to true for double clicks. Default is false.',
        required: false,
      },
      includeSnapshot: {
        name: 'includeSnapshot',
        type: 'boolean',
        description:
          'Whether to include a snapshot in the response. Default is false.',
        required: false,
      },
    },
  },
  close_page: {
    description:
      'Closes the page by its index. The last open page cannot be closed.',
    args: {
      pageId: {
        name: 'pageId',
        type: 'number',
        description:
          'The ID of the page to close. Call list_pages to list pages.',
        required: true,
      },
    },
  },
  drag: {
    description: 'Drag an element onto another element',
    args: {
      from_uid: {
        name: 'from_uid',
        type: 'string',
        description: 'The uid of the element to drag',
        required: true,
      },
      to_uid: {
        name: 'to_uid',
        type: 'string',
        description: 'The uid of the element to drop into',
        required: true,
      },
      includeSnapshot: {
        name: 'includeSnapshot',
        type: 'boolean',
        description:
          'Whether to include a snapshot in the response. Default is false.',
        required: false,
      },
    },
  },
  emulate: {
    description: 'Emulates various features on the selected page.',
    args: {
      networkConditions: {
        name: 'networkConditions',
        type: 'string',
        description:
          'Throttle network. Set to "No emulation" to disable. If omitted, conditions remain unchanged.',
        required: false,
        enum: [
          'No emulation',
          'Offline',
          'Slow 3G',
          'Fast 3G',
          'Slow 4G',
          'Fast 4G',
        ],
      },
      cpuThrottlingRate: {
        name: 'cpuThrottlingRate',
        type: 'number',
        description:
          'Represents the CPU slowdown factor. Set the rate to 1 to disable throttling. If omitted, throttling remains unchanged.',
        required: false,
      },
      geolocation: {
        name: 'geolocation',
        type: 'string',
        description:
          'Geolocation to emulate. Set to null to clear the geolocation override.',
        required: false,
      },
      userAgent: {
        name: 'userAgent',
        type: 'string',
        description:
          'User agent to emulate. Set to null to clear the user agent override.',
        required: false,
      },
      colorScheme: {
        name: 'colorScheme',
        type: 'string',
        description:
          'Emulate the dark or the light mode. Set to "auto" to reset to the default.',
        required: false,
        enum: ['dark', 'light', 'auto'],
      },
      viewport: {
        name: 'viewport',
        type: 'string',
        description:
          'Viewport to emulate. Set to null to reset to the default viewport.',
        required: false,
      },
    },
  },
  evaluate_script: {
    description:
      'Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON,\nso returned values have to be JSON-serializable.',
    args: {
      function: {
        name: 'function',
        type: 'string',
        description:
          'A JavaScript function declaration to be executed by the tool in the currently selected page.\nExample without arguments: `() => {\n  return document.title\n}` or `async () => {\n  return await fetch("example.com")\n}`.\nExample with arguments: `(el) => {\n  return el.innerText;\n}`\n',
        required: true,
      },
      args: {
        name: 'args',
        type: 'array',
        description: 'An optional list of arguments to pass to the function.',
        required: false,
      },
    },
  },
  fill: {
    description:
      'Type text into a input, text area or select an option from a <select> element.',
    args: {
      uid: {
        name: 'uid',
        type: 'string',
        description:
          'The uid of an element on the page from the page content snapshot',
        required: true,
      },
      value: {
        name: 'value',
        type: 'string',
        description: 'The value to fill in',
        required: true,
      },
      includeSnapshot: {
        name: 'includeSnapshot',
        type: 'boolean',
        description:
          'Whether to include a snapshot in the response. Default is false.',
        required: false,
      },
    },
  },
  fill_form: {
    description: 'Fill out multiple form elements at once',
    args: {
      elements: {
        name: 'elements',
        type: 'array',
        description: 'Elements from snapshot to fill out.',
        required: true,
      },
      includeSnapshot: {
        name: 'includeSnapshot',
        type: 'boolean',
        description:
          'Whether to include a snapshot in the response. Default is false.',
        required: false,
      },
    },
  },
  get_console_message: {
    description:
      'Gets a console message by its ID. You can get all messages by calling list_console_messages.',
    args: {
      msgid: {
        name: 'msgid',
        type: 'number',
        description:
          'The msgid of a console message on the page from the listed console messages',
        required: true,
      },
    },
  },
  get_network_request: {
    description:
      'Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.',
    args: {
      reqid: {
        name: 'reqid',
        type: 'number',
        description:
          'The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel.',
        required: false,
      },
      requestFilePath: {
        name: 'requestFilePath',
        type: 'string',
        description:
          'The absolute or relative path to save the request body to. If omitted, the body is returned inline.',
        required: false,
      },
      responseFilePath: {
        name: 'responseFilePath',
        type: 'string',
        description:
          'The absolute or relative path to save the response body to. If omitted, the body is returned inline.',
        required: false,
      },
    },
  },
  handle_dialog: {
    description:
      'If a browser dialog was opened, use this command to handle it',
    args: {
      action: {
        name: 'action',
        type: 'string',
        description: 'Whether to dismiss or accept the dialog',
        required: true,
        enum: ['accept', 'dismiss'],
      },
      promptText: {
        name: 'promptText',
        type: 'string',
        description: 'Optional prompt text to enter into the dialog.',
        required: false,
      },
    },
  },
  hover: {
    description: 'Hover over the provided element',
    args: {
      uid: {
        name: 'uid',
        type: 'string',
        description:
          'The uid of an element on the page from the page content snapshot',
        required: true,
      },
      includeSnapshot: {
        name: 'includeSnapshot',
        type: 'boolean',
        description:
          'Whether to include a snapshot in the response. Default is false.',
        required: false,
      },
    },
  },
  list_console_messages: {
    description:
      'List all console messages for the currently selected page since the last navigation.',
    args: {
      pageSize: {
        name: 'pageSize',
        type: 'integer',
        description:
          'Maximum number of messages to return. When omitted, returns all requests.',
        required: false,
      },
      pageIdx: {
        name: 'pageIdx',
        type: 'integer',
        description:
          'Page number to return (0-based). When omitted, returns the first page.',
        required: false,
      },
      types: {
        name: 'types',
        type: 'array',
        description:
          'Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.',
        required: false,
      },
      includePreservedMessages: {
        name: 'includePreservedMessages',
        type: 'boolean',
        description:
          'Set to true to return the preserved messages over the last 3 navigations.',
        required: false,
        default: false,
      },
    },
  },
  list_network_requests: {
    description:
      'List all requests for the currently selected page since the last navigation.',
    args: {
      pageSize: {
        name: 'pageSize',
        type: 'integer',
        description:
          'Maximum number of requests to return. When omitted, returns all requests.',
        required: false,
      },
      pageIdx: {
        name: 'pageIdx',
        type: 'integer',
        description:
          'Page number to return (0-based). When omitted, returns the first page.',
        required: false,
      },
      resourceTypes: {
        name: 'resourceTypes',
        type: 'array',
        description:
          'Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.',
        required: false,
      },
      includePreservedRequests: {
        name: 'includePreservedRequests',
        type: 'boolean',
        description:
          'Set to true to return the preserved requests over the last 3 navigations.',
        required: false,
        default: false,
      },
    },
  },
  list_pages: {
    description: 'Get a list of pages open in the browser.',
    args: {},
  },
  navigate_page: {
    description: 'Navigates the currently selected page to a URL.',
    args: {
      type: {
        name: 'type',
        type: 'string',
        description:
          'Navigate the page by URL, back or forward in history, or reload.',
        required: false,
        enum: ['url', 'back', 'forward', 'reload'],
      },
      url: {
        name: 'url',
        type: 'string',
        description: 'Target URL (only type=url)',
        required: false,
      },
      ignoreCache: {
        name: 'ignoreCache',
        type: 'boolean',
        description: 'Whether to ignore cache on reload.',
        required: false,
      },
      handleBeforeUnload: {
        name: 'handleBeforeUnload',
        type: 'string',
        description:
          'Whether to auto accept or beforeunload dialogs triggered by this navigation. Default is accept.',
        required: false,
        enum: ['accept', 'decline'],
      },
      initScript: {
        name: 'initScript',
        type: 'string',
        description:
          'A JavaScript script to be executed on each new document before any other scripts for the next navigation.',
        required: false,
      },
      timeout: {
        name: 'timeout',
        type: 'integer',
        description:
          'Maximum wait time in milliseconds. If set to 0, the default timeout will be used.',
        required: false,
      },
    },
  },
  new_page: {
    description: 'Creates a new page',
    args: {
      url: {
        name: 'url',
        type: 'string',
        description: 'URL to load in a new page.',
        required: true,
      },
      background: {
        name: 'background',
        type: 'boolean',
        description:
          'Whether to open the page in the background without bringing it to the front. Default is false (foreground).',
        required: false,
      },
      timeout: {
        name: 'timeout',
        type: 'integer',
        description:
          'Maximum wait time in milliseconds. If set to 0, the default timeout will be used.',
        required: false,
      },
    },
  },
  performance_analyze_insight: {
    description:
      'Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.',
    args: {
      insightSetId: {
        name: 'insightSetId',
        type: 'string',
        description:
          'The id for the specific insight set. Only use the ids given in the "Available insight sets" list.',
        required: true,
      },
      insightName: {
        name: 'insightName',
        type: 'string',
        description:
          'The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"',
        required: true,
      },
    },
  },
  performance_start_trace: {
    description:
      'Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.',
    args: {
      reload: {
        name: 'reload',
        type: 'boolean',
        description:
          'Determines if, once tracing has started, the current selected page should be automatically reloaded. Navigate the page to the right URL using the navigate_page tool BEFORE starting the trace if reload or autoStop is set to true.',
        required: true,
      },
      autoStop: {
        name: 'autoStop',
        type: 'boolean',
        description:
          'Determines if the trace recording should be automatically stopped.',
        required: true,
      },
      filePath: {
        name: 'filePath',
        type: 'string',
        description:
          'The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).',
        required: false,
      },
    },
  },
  performance_stop_trace: {
    description:
      'Stops the active performance trace recording on the selected page.',
    args: {
      filePath: {
        name: 'filePath',
        type: 'string',
        description:
          'The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).',
        required: false,
      },
    },
  },
  press_key: {
    description:
      'Press a key or key combination. Use this when other input methods like fill() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).',
    args: {
      key: {
        name: 'key',
        type: 'string',
        description:
          'A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta',
        required: true,
      },
      includeSnapshot: {
        name: 'includeSnapshot',
        type: 'boolean',
        description:
          'Whether to include a snapshot in the response. Default is false.',
        required: false,
      },
    },
  },
  resize_page: {
    description:
      "Resizes the selected page's window so that the page has specified dimension",
    args: {
      width: {
        name: 'width',
        type: 'number',
        description: 'Page width',
        required: true,
      },
      height: {
        name: 'height',
        type: 'number',
        description: 'Page height',
        required: true,
      },
    },
  },
  select_page: {
    description: 'Select a page as a context for future tool calls.',
    args: {
      pageId: {
        name: 'pageId',
        type: 'number',
        description:
          'The ID of the page to select. Call list_pages to get available pages.',
        required: true,
      },
      bringToFront: {
        name: 'bringToFront',
        type: 'boolean',
        description: 'Whether to focus the page and bring it to the top.',
        required: false,
      },
    },
  },
  take_screenshot: {
    description: 'Take a screenshot of the page or element.',
    args: {
      format: {
        name: 'format',
        type: 'string',
        description:
          'Type of format to save the screenshot as. Default is "png"',
        required: false,
        default: 'png',
        enum: ['png', 'jpeg', 'webp'],
      },
      quality: {
        name: 'quality',
        type: 'number',
        description:
          'Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.',
        required: false,
      },
      uid: {
        name: 'uid',
        type: 'string',
        description:
          'The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.',
        required: false,
      },
      fullPage: {
        name: 'fullPage',
        type: 'boolean',
        description:
          'If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.',
        required: false,
      },
      filePath: {
        name: 'filePath',
        type: 'string',
        description:
          'The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.',
        required: false,
      },
    },
  },
  take_snapshot: {
    description:
      'Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique\nidentifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected\nin the DevTools Elements panel (if any).',
    args: {
      verbose: {
        name: 'verbose',
        type: 'boolean',
        description:
          'Whether to include all possible information available in the full a11y tree. Default is false.',
        required: false,
      },
      filePath: {
        name: 'filePath',
        type: 'string',
        description:
          'The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.',
        required: false,
      },
    },
  },
  upload_file: {
    description: 'Upload a file through a provided element.',
    args: {
      uid: {
        name: 'uid',
        type: 'string',
        description:
          'The uid of the file input element or an element that will open file chooser on the page from the page content snapshot',
        required: true,
      },
      filePath: {
        name: 'filePath',
        type: 'string',
        description: 'The local path of the file to upload',
        required: true,
      },
      includeSnapshot: {
        name: 'includeSnapshot',
        type: 'boolean',
        description:
          'Whether to include a snapshot in the response. Default is false.',
        required: false,
      },
    },
  },
  wait_for: {
    description: 'Wait for the specified text to appear on the selected page.',
    args: {
      text: {
        name: 'text',
        type: 'string',
        description: 'Text to appear on the page',
        required: true,
      },
      timeout: {
        name: 'timeout',
        type: 'integer',
        description:
          'Maximum wait time in milliseconds. If set to 0, the default timeout will be used.',
        required: false,
      },
    },
  },
} as const;
