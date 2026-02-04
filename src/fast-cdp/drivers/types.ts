/**
 * Site Driver Types
 *
 * Defines interfaces for site-specific drivers that handle
 * ChatGPT, Gemini, and potentially other AI chat services.
 */

import type {CdpClient} from '../cdp-client.js';
import type {ChatTimings, ChatDebugInfo} from '../fast-chat.js';

/**
 * Selector specification with optional Shadow DOM handling
 */
export interface SelectorSpec {
  /** CSS selector string */
  css: string;
  /** Whether Shadow DOM traversal is needed (default: false) */
  deep?: boolean;
  /** Optional parent selector to limit search scope */
  within?: string;
}

/**
 * Site-specific selectors for common UI elements
 */
export interface DriverSelectors {
  /** Root element for conversation content */
  conversationRoot: string[];
  /** Input field for prompts */
  promptInput: string[];
  /** Send button */
  sendButton: string[];
  /** Stop/cancel button (shown during generation) */
  stopButton: string[];
  /** User message containers */
  userMessage: string[];
  /** Assistant/AI response containers */
  assistantMessage: string[];
  /** Elements indicating busy/loading state */
  busyIndicator: string[];
  /** Error banner or message */
  errorBanner: string[];
}

/**
 * Result of sending a prompt
 */
export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Result of extracting a response
 */
export interface ExtractResult {
  text: string;
  confidence: number;
  evidence: string;
}

/**
 * Chat result returned by the driver
 */
export interface DriverChatResult {
  answer: string;
  timings: ChatTimings;
  debug?: ChatDebugInfo;
}

/**
 * Options for driver operations
 */
export interface DriverOptions {
  /** Whether to collect debug information */
  debug?: boolean;
  /** Maximum wait time for response in ms */
  maxWaitMs?: number;
}

/**
 * Site Driver interface
 *
 * Each site (ChatGPT, Gemini, etc.) implements this interface
 * to handle site-specific DOM structure and behavior.
 */
export interface SiteDriver {
  /** Driver name (e.g., 'chatgpt', 'gemini') */
  readonly name: string;

  /** Site selectors */
  readonly selectors: DriverSelectors;

  /**
   * Initialize the driver with a CDP client
   */
  setClient(client: CdpClient): void;

  /**
   * Send a prompt to the AI
   * @param text - The prompt text
   * @returns Promise resolving when prompt is sent (not when response is received)
   */
  sendPrompt(text: string): Promise<SendResult>;

  /**
   * Check if the AI is currently processing/generating
   * @returns true if busy, false if ready for input
   */
  isProcessing(): Promise<boolean>;

  /**
   * Wait for the response to complete
   * @param options - Wait options
   * @returns Promise resolving when response is ready
   */
  waitForResponse(options?: DriverOptions): Promise<void>;

  /**
   * Extract the latest response from the page
   * @param options - Extraction options
   * @returns The extracted response
   */
  extractResponse(options?: DriverOptions): Promise<ExtractResult>;

  /**
   * Get the current page URL
   */
  getCurrentUrl(): Promise<string>;

  /**
   * Check if the page requires login
   */
  needsLogin(): Promise<boolean>;
}

/**
 * Driver metadata for manifest registration
 */
export interface DriverMeta {
  /** Driver name */
  name: string;
  /** URL patterns this driver handles */
  urlPatterns: string[];
  /** Human-readable description */
  description: string;
}
