import { Directive, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { ConfigService } from '../_services/config.service';
import { HTTP_ERROR_HANDLING } from '../_services/http-interceptor.service';

@Directive({
    // eslint-disable-next-line @angular-eslint/directive-selector
    selector: '[docEmbed]',
})
export class DocEmbedDirective implements OnChanges {

    /**
     * URL of the documentation page to embed.
     */
    @Input() docEmbed?: string;

    constructor(
        private readonly element: ElementRef,
        private readonly http: HttpClient,
        private readonly cfgSvc: ConfigService,
    ) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.docEmbed && this.docEmbed) {
            const e = this.element.nativeElement;

            // Do not bother requesting pages during an end-2-end test
            if (this.cfgSvc.isUnderTest) {
                e.innerHTML = `<div class="container py-5 m5-5 border rounded text-center">[${this.docEmbed}]</div>`;
                return;
            }

            // Load the document, suppressing errors (since it's a less important resource)
            this.http.get(this.docEmbed, {responseType: 'text', context: new HttpContext().set(HTTP_ERROR_HANDLING, false)})
                .subscribe({
                    // Update the inner HTML of the element on success
                    next: t => e.innerHTML = t,
                    // Display error on failure
                    error: (err: Error) => e.innerHTML = '<div class="container text-center alert alert-secondary fade-in">' +
                            `Could not load the resource at <a href="${this.docEmbed}" target="_blank" rel="noopener">${this.docEmbed}</a>:<br>` +
                            `<span class="small">${err.message}</span>` +
                        '</div>',
                });
        }
    }
}
