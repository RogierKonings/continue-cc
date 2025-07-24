declare global {
  const ReadableStream: {
    prototype: ReadableStream;
    new <R = any>(
      underlyingSource?: UnderlyingSource<R>,
      strategy?: QueuingStrategy<R>
    ): ReadableStream<R>;
  };

  interface ReadableStream<R = any> {
    readonly locked: boolean;
    cancel(reason?: any): Promise<void>;
    getReader(): ReadableStreamDefaultReader<R>;
  }

  interface UnderlyingSource<R = any> {
    start?(controller: ReadableStreamDefaultController<R>): void | PromiseLike<void>;
    pull?(controller: ReadableStreamDefaultController<R>): void | PromiseLike<void>;
    cancel?(reason?: any): void | PromiseLike<void>;
  }

  interface ReadableStreamDefaultController<R = any> {
    readonly desiredSize: number | null;
    close(): void;
    enqueue(chunk: R): void;
    error(e?: any): void;
  }

  interface ReadableStreamDefaultReader<R = any> {
    readonly closed: Promise<undefined>;
    cancel(reason?: any): Promise<void>;
    read(): Promise<ReadableStreamDefaultReadResult<R>>;
    releaseLock(): void;
  }

  interface ReadableStreamDefaultReadResult<T> {
    done: boolean;
    value?: T;
  }

  interface QueuingStrategy<T = any> {
    highWaterMark?: number;
    size?: (chunk: T) => number;
  }

  const TextDecoder: {
    prototype: TextDecoder;
    new (label?: string, options?: TextDecoderOptions): TextDecoder;
  };

  interface TextDecoder {
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    decode(input?: ArrayBufferView | ArrayBuffer, options?: TextDecodeOptions): string;
  }

  interface TextDecoderOptions {
    fatal?: boolean;
    ignoreBOM?: boolean;
  }

  interface TextDecodeOptions {
    stream?: boolean;
  }
}

export {};
