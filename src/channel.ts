import type { ChannelOptions, Pair } from './types';
import Pool from './pool';

const createWorker = async () => {
    const worker = await import('./worker.js?raw');
    return new Worker(
        URL.createObjectURL(new Blob([worker.default], { type: 'application/script' }))
    );
};
const poolSize = 4;
const pool = new Pool({
    worker: createWorker,
    size:
        window.navigator.hardwareConcurrency && window.navigator.hardwareConcurrency > 1
            ? Math.max(1, poolSize)
            : 1,
});

class Channel {
    static deg2rad(ang = 0) {
        return (ang * Math.PI) / 180;
    }

    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D;
    private _cells: number[];
    private _size: Pair;
    private _angle: number;
    private _options: ChannelOptions;

    public viewBox: Pair;
    public color: string = 'black';

    constructor(options: ChannelOptions) {
        this.color = options.color!;
        this._canvas = document.createElement('canvas');
        this._ctx = <CanvasRenderingContext2D>this._canvas.getContext('2d', {
            alpha: false,
            willReadFrequently: true,
            antialias: false,
        });
        this._ctx.imageSmoothingEnabled = false;
        this.update(options);
    }

    private async getOrigin() {
        const { source, deg } = this._options;
        if (!source) return { origin: new Uint8ClampedArray(), vw: 0, vh: 0 };
        
        // If the image isn't loaded yet, wait for it
        if (source instanceof HTMLImageElement && !source.complete) {
            await new Promise(resolve => {
                source.onload = resolve;
            });
        }
        
        // prepare canvas
        const [w, h] = [source.width, source.height];
        this._angle = Channel.deg2rad(deg);
        const cos = Math.abs(Math.cos(this.angle));
        const sin = Math.abs(Math.sin(this.angle));
        
        // Calculate dimensions and ensure they're valid positive integers
        const vw = Math.max(1, Math.ceil(w * cos + h * sin));
        const vh = Math.max(1, Math.ceil(w * sin + h * cos));
        
        // Set canvas dimensions
        this._canvas.width = vw;
        this._canvas.height = vh;
        this.viewBox = [vw, vh];

        // prepare ctx
        this._ctx.fillStyle = 'white';
        this._ctx.fillRect(0, 0, vw, vh);
        
        // Reset transform before applying new transformations
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Apply transformations in correct order
        this._ctx.translate(vw/2, vh/2);
        this._ctx.rotate(this.angle);
        this._ctx.translate(-w/2, -h/2);
        
        // Draw image
        this._ctx.drawImage(source, 0, 0, w, h);
        
        // Reset transform
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        try {
            const imageData = this._ctx.getImageData(0, 0, vw, vh);
            return {
                origin: imageData.data,
                vw,
                vh,
            };
        } catch (error) {
            console.error('Error getting image data:', error);
            return { origin: new Uint8ClampedArray(), vw: 0, vh: 0 };
        }
    }

    async update(options: ChannelOptions) {
        this._options = {
            ...this._options,
            ...options,
        };
        if (!this._options.source) {
            return;
        }

        // If the image isn't loaded yet, wait for it
        if (this._options.source instanceof HTMLImageElement && !this._options.source.complete) {
            await new Promise(resolve => {
                this._options.source!.onload = resolve;
            });
        }

        const { name, cellSize } = this._options;
        const origin = await this.getOrigin();
        const { cells, column, row } = await pool.addTask({
            ...origin,
            name,
            cellSize,
        });
        this._size = [column, row];
        this._cells = cells;
    }

    get angle(): number {
        return this._angle;
    }

    get size(): [number, number] {
        return this._size;
    }

    get cellSize(): Pair {
        return this._options.cellSize!;
    }

    get name(): string {
        return this._options.name!;
    }

    get cells(): number[] {
        return this._cells;
    }

    destory() {}
}

export default Channel;
