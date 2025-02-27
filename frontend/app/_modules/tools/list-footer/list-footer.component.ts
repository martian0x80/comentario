import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NoDataComponent } from '../no-data/no-data.component';
import { SpinnerDirective } from '../_directives/spinner.directive';

/**
 * Component meant to be placed at the bottom of a list. Displays:
 *   * An item counter with the number of items displayed in the list.
 *   * An optional button to load more items.
 *   * A placeholder text if the list is empty. The placeholder is the component's content (must have at least non-text
 *     node), if none is provided, shows the standard <app-no-data> component.
 */
@Component({
    selector: 'app-list-footer',
    templateUrl: './list-footer.component.html',
    styleUrls: ['./list-footer.component.scss'],
    imports: [
        NoDataComponent,
        SpinnerDirective,
    ],
})
export class ListFooterComponent {

    /** Whether more items can be loaded. Defaults to false. */
    @Input()
    canLoadMore = false;

    /** Whether items are being loaded. Defaults to false. */
    @Input()
    loading = false;

    /** Number of items displayed in the list. Defaults to 0. */
    @Input({required: true})
    count?: number;

    /** Event emitted when the user wants to load more items. */
    @Output()
    loadMore = new EventEmitter<void>();

}
