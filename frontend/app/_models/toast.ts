import {
    faCheck,
    faCircleExclamation,
    faExclamation,
    faInfoCircle,
    IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

export enum Severity {
    INFO,
    SUCCESS,
    WARNING,
    ERROR,
}

/**
 * A toast notification.
 */
export class Toast {

    /** Whether technical details should be shown. */
    detailsShown = false;

    constructor(
        /**
         * Notification severity.
         */
        readonly severity: Severity,
        /**
         * Optional toast ID, like 'this-fish-cannot-be-cooked'.
         */
        readonly id: string,
        /**
         * Optional HTTP error code.
         */
        readonly errorCode?: number,
        /**
         * Optional details.
         */
        readonly details?: string,
        /**
         * Optional error object.
         */
        readonly error?: any,
    ) {}

    /**
     * Return the alert type that corresponds to the toast's severity.
     */
    get alertType(): string {
        switch (this.severity) {
            case Severity.INFO:    return 'info';
            case Severity.SUCCESS: return 'success';
            case Severity.WARNING: return 'warning';
            case Severity.ERROR:   return 'danger';
        }
    }

    /**
     * Return the toast CSS class that corresponds to the toast's severity.
     */
    get className(): string {
        switch (this.severity) {
            case Severity.INFO:    return 'bg-info';
            case Severity.SUCCESS: return 'bg-success';
            case Severity.WARNING: return 'bg-warning';
            case Severity.ERROR:   return 'bg-danger';
        }
    }

    /**
     * Return the FA icon name corresponding to the toast's severity.
     */
    get icon(): IconDefinition {
        switch (this.severity) {
            case Severity.SUCCESS: return faCheck;
            case Severity.WARNING: return faExclamation;
            case Severity.ERROR:   return faCircleExclamation;
        }
        return faInfoCircle;
    }

    /**
     * Toggle detailsShown on and off.
     */
    toggleDetails() {
        this.detailsShown = !this.detailsShown;
    }
}
