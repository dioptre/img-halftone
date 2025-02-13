import css from './index.css?inline';
import type { Pair } from './types';
import { Shape } from './types';
import { CanvasPainter, GridPainter } from './painter';
import Channel from './channel';

const max = Math.pow(2, 21);
const template = document.createElement('template');
template.innerHTML = `<style>${css}</style><img id="img" alt="img-halftone" />`;

class ImgHalftone extends HTMLElement {
    static loadImage(url = '') {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            let img = new Image();
            img.crossOrigin = 'anonymous';
            img.id = 'img';
            img.setAttribute('part', 'img');
            img.onload = () => {
                resolve(img);
            };
            img.onerror = (error) => reject(error);
            img.src = url;
        });
    }
    static get observedAttributes() {
        return ['src', 'alt'];
    }

    private img: HTMLImageElement | null;
    private painter: CanvasPainter | GridPainter;
    private channels: [Channel, Channel, Channel, Channel];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.append(template.content.cloneNode(true));
        this.painter =
            this.varient === 'grid'
                ? new GridPainter({ shape: this.shape })
                : new CanvasPainter({ shape: this.shape });
        this.channels = [
            new Channel({ name: 'key', color: '#333', deg: 45 }),
            new Channel({ name: 'cyan', color: 'cyan', deg: 15 }),
            new Channel({ name: 'magenta', color: 'magenta', deg: 75 }),
            new Channel({ name: 'yellow', color: 'yellow', deg: 0 }),
        ];
        this.img = this.shadowRoot!.querySelector('#img');
    }

    async attributeChangedCallback(name: string, prev: string, next: string) {
        if (prev === next) {
            return;
        }
        switch (name) {
            case 'src': {
                if (!this.src) {
                    break;
                }
                try {
                    this.shadowRoot!.host.classList.add('loading');
                    this.dispatchEvent(new CustomEvent('loading', {
                        bubbles: true,
                        composed: true
                    }));
                    
                    const img = await ImgHalftone.loadImage(this.src);
                    img.setAttribute('alt', this.alt);
                    // replace bg
                    this.img!.parentNode!.replaceChild(img, this.img!);
                    this.img = img;

                    // Emit loaded event
                    this.dispatchEvent(new CustomEvent('loaded', {
                        bubbles: true,
                        composed: true,
                        detail: { width: img.width, height: img.height }
                    }));

                    // limit max pixel
                    const source = <HTMLImageElement>this.img.cloneNode();
                    source.crossOrigin = 'anonymous';  // Ensure we can read the pixel data
                    const pixels = this.img.width * this.img.height;
                    const scale = Math.sqrt(max / pixels);
                    source.width = Math.ceil(this.img.width * scale);
                    source.height = Math.ceil(this.img.height * scale);

                    // Wait for the cloned image to load
                    await new Promise((resolve) => {
                        source.onload = resolve;
                        source.src = this.img.src;
                    });

                    // update
                    await this.update({ source });
                } finally {
                    this.shadowRoot!.host.classList.remove('loading');
                }
                break;
            }
            case 'alt': {
                this.img?.setAttribute('alt', this.alt);
                break;
            }
            default:
                break;
        }
    }

    private async update({ source }: { source: HTMLImageElement }) {
        const size = this.cellsize;
        const cellSize: Pair = [size, size];
        
        // Ensure image is loaded before emitting canvas ready event
        await new Promise((resolve) => {
            if (source.complete) {
                resolve(null);
            } else {
                source.onload = () => resolve(null);
            }
        });

        // Now we can safely emit canvas ready event with correct dimensions
        this.dispatchEvent(new CustomEvent('canvasready', {
            bubbles: true,
            composed: true,
            detail: { width: source.width, height: source.height }
        }));

        await Promise.all(
            this.channels.map((channel) => channel.update({ source, cellSize }))
        );
        
        await this.painter.draw(this.channels, [source.width, source.height]);
        
        // Emit paint complete event
        this.dispatchEvent(new CustomEvent('paintcomplete', {
            bubbles: true,
            composed: true
        }));
    }

    connectedCallback() {
        this.shadowRoot!.appendChild(this.painter.dom);
        if (!this.src) {
            this.src = '';
        }
    }

    disconnectedCallback() {
        this.img = null;
    }

    get src(): string {
        return this.getAttribute('src') ?? '';
    }

    set src(val: string) {
        this.setAttribute('src', val);
    }

    get alt(): string {
        return this.getAttribute('alt') ?? 'img-halftone';
    }

    set alt(val: string) {
        this.setAttribute('alt', val);
    }

    get varient(): string {
        return this.getAttribute('varient') ?? 'canvas';
    }

    get cellsize(): number {
        return +this.getAttribute('cellsize')! || 4;
    }

    get shape(): Shape {
        const val = this.getAttribute('shape') as Shape;
        return Object.values(Shape).includes(val) ? val : Shape.CIRCLE;
    }
}

if (!window.customElements.get('img-halftone')) {
    window.customElements.define('img-halftone', ImgHalftone);
}
declare global {
    interface HTMLElementTagNameMap {
        'img-halftone': ImgHalftone;
    }
}

export default ImgHalftone;
