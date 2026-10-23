export interface LiveApiCallbacks {
  onAudioChunk: (base64Pcm: string) => void;
  onTranscript: (text: string) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onReady: () => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export class LiveApiProvider {
  private ws: WebSocket | null = null;
  private callbacks: LiveApiCallbacks;
  private isConnected = false;
  private reconnectTimeout: any = null;

  constructor(callbacks: LiveApiCallbacks) {
    this.callbacks = callbacks;
  }

  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/live-ws`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ready') {
              this.callbacks.onReady();
              resolve(true);
            } else if (data.type === 'audio' && data.audio) {
              this.callbacks.onAudioChunk(data.audio);
            } else if (data.type === 'transcript' && data.text) {
              this.callbacks.onTranscript(data.text);
            } else if (data.type === 'interrupted') {
              this.callbacks.onInterrupted();
            } else if (data.type === 'turn_complete') {
              this.callbacks.onTurnComplete();
            } else if (data.type === 'error') {
              this.callbacks.onError(data.error);
              resolve(false);
            }
          } catch (e) {
            console.error('Error parsing live WS message:', e);
          }
        };

        this.ws.onerror = (err) => {
          console.warn('Live API WebSocket connection error:', err);
          this.isConnected = false;
          this.callbacks.onError('Live API WebSocket connection failed');
          resolve(false);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.callbacks.onClose();
        };

        // Timeout fallback
        setTimeout(() => {
          if (!this.isConnected) {
            resolve(false);
          }
        }, 5000);
      } catch (err: any) {
        console.warn('Failed to initiate Live WebSocket:', err);
        resolve(false);
      }
    });
  }

  sendAudioChunk(base64Pcm: string) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({
      type: 'audio',
      audio: base64Pcm
    }));
  }

  sendText(text: string) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({
      type: 'text',
      text
    }));
  }

  sendInterrupt() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({
      type: 'interrupt'
    }));
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  disconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
    this.isConnected = false;
  }
}
