export type AppStatus =
  | 'idle'
  | 'transcribing'
  | 'generating'
  | 'rendering'
  | 'error';

export interface StatusMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  message: string;
  timestamp: number;
}

export function getStatusLabel(status: AppStatus): string {
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'transcribing':
      return 'Transcribing audio...';
    case 'generating':
      return 'Generating diagram...';
    case 'rendering':
      return 'Rendering shapes...';
    case 'error':
      return 'Error occurred';
  }
}

export function getStatusIcon(status: AppStatus): string {
  switch (status) {
    case 'idle':
      return '✓';
    case 'transcribing':
      return '🎤';
    case 'generating':
      return '🤖';
    case 'rendering':
      return '🎨';
    case 'error':
      return '⚠️';
  }
}
