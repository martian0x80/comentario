import { Component, Input } from '@angular/core';
import { DynamicConfigItem } from '../../../../generated-api';

@Component({
    selector: 'app-dyn-config-item-value',
    templateUrl: './dyn-config-item-value.component.html',
})
export class DynConfigItemValueComponent {

    /** The item to display value for. */
    @Input({required: true})
    item?: DynamicConfigItem;

}
