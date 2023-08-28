import { Component, Input } from '@angular/core';
import { faLightbulb } from '@fortawesome/free-solid-svg-icons';
import { IconProp } from '@fortawesome/fontawesome-svg-core';

@Component({
  selector: 'app-info-block',
  templateUrl: './info-block.component.html',
  styleUrls: ['./info-block.component.scss']
})
export class InfoBlockComponent {

    /**
     * Icon to display to the info text. If null/undefined, none will be displayed.
     */
    @Input()
    icon: IconProp | null | undefined = faLightbulb;
}
