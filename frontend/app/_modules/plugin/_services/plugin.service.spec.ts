import { TestBed } from '@angular/core/testing';
import { MockProvider } from 'ng-mocks';
import { PluginService } from './plugin.service';
import { LANGUAGE } from '../../../../environments/languages';
import { ConfigService } from '../../../_services/config.service';
import { PluginMessageService } from './plugin-message.service';

describe('PluginService', () => {

    let service: PluginService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers:[
                {provide: LANGUAGE, useValue: {}},
                MockProvider(ConfigService, {pluginConfig: {plugins: []}}),
                MockProvider(PluginMessageService),
            ],
        });
        service = TestBed.inject(PluginService);
    });

    it('is created', () => {
        expect(service).toBeTruthy();
    });
});
