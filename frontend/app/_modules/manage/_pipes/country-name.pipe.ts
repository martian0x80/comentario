import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'countryName',
})
export class CountryNamePipe implements PipeTransform {

    private static NAMES: Record<string, string> = {
        AD: $localize`Andorra`,
        AE: $localize`United Arab Emirates`,
        AF: $localize`Afghanistan`,
        AG: $localize`Antigua and Barbuda`,
        AI: $localize`Anguilla`,
        AL: $localize`Albania`,
        AM: $localize`Armenia`,
        AN: $localize`Netherlands Antilles`,
        AO: $localize`Angola`,
        AQ: $localize`Antarctica`,
        AR: $localize`Argentina`,
        AS: $localize`American Samoa`,
        AT: $localize`Austria`,
        AU: $localize`Australia`,
        AW: $localize`Aruba`,
        AZ: $localize`Azerbaijan`,
        BA: $localize`Bosnia and Herzegovina`,
        BB: $localize`Barbados`,
        BD: $localize`Bangladesh`,
        BE: $localize`Belgium`,
        BF: $localize`Burkina Faso`,
        BG: $localize`Bulgaria`,
        BH: $localize`Bahrain`,
        BI: $localize`Burundi`,
        BJ: $localize`Benin`,
        BL: $localize`Saint Barthélemy`,
        BM: $localize`Bermuda`,
        BN: $localize`Brunei`,
        BO: $localize`Bolivia`,
        BR: $localize`Brazil`,
        BS: $localize`Bahamas`,
        BT: $localize`Bhutan`,
        BW: $localize`Botswana`,
        BY: $localize`Belarus`,
        BZ: $localize`Belize`,
        CA: $localize`Canada`,
        CC: $localize`Cocos Islands`,
        CD: $localize`Democratic Republic of the Congo`,
        CF: $localize`Central African Republic`,
        CG: $localize`Republic of the Congo`,
        CH: $localize`Switzerland`,
        CI: $localize`Ivory Coast`,
        CK: $localize`Cook Islands`,
        CL: $localize`Chile`,
        CM: $localize`Cameroon`,
        CN: $localize`China`,
        CO: $localize`Colombia`,
        CR: $localize`Costa Rica`,
        CU: $localize`Cuba`,
        CV: $localize`Cape Verde`,
        CW: $localize`Curacao`,
        CX: $localize`Christmas Island`,
        CY: $localize`Cyprus`,
        CZ: $localize`Czech Republic`,
        DE: $localize`Germany`,
        DJ: $localize`Djibouti`,
        DK: $localize`Denmark`,
        DM: $localize`Dominica`,
        DO: $localize`Dominican Republic`,
        DZ: $localize`Algeria`,
        EC: $localize`Ecuador`,
        EE: $localize`Estonia`,
        EG: $localize`Egypt`,
        EH: $localize`Western Sahara`,
        ER: $localize`Eritrea`,
        ES: $localize`Spain`,
        ET: $localize`Ethiopia`,
        FI: $localize`Finland`,
        FJ: $localize`Fiji`,
        FK: $localize`Falkland Islands`,
        FM: $localize`Micronesia`,
        FO: $localize`Faroe Islands`,
        FR: $localize`France`,
        GA: $localize`Gabon`,
        GB: $localize`United Kingdom`,
        GD: $localize`Grenada`,
        GE: $localize`Georgia`,
        GG: $localize`Guernsey`,
        GH: $localize`Ghana`,
        GI: $localize`Gibraltar`,
        GL: $localize`Greenland`,
        GM: $localize`Gambia`,
        GN: $localize`Guinea`,
        GQ: $localize`Equatorial Guinea`,
        GR: $localize`Greece`,
        GT: $localize`Guatemala`,
        GU: $localize`Guam`,
        GW: $localize`Guinea-Bissau`,
        GY: $localize`Guyana`,
        HK: $localize`Hong Kong`,
        HN: $localize`Honduras`,
        HR: $localize`Croatia`,
        HT: $localize`Haiti`,
        HU: $localize`Hungary`,
        ID: $localize`Indonesia`,
        IE: $localize`Ireland`,
        IL: $localize`Israel`,
        IM: $localize`Isle of Man`,
        IN: $localize`India`,
        IO: $localize`British Indian Ocean Territory`,
        IQ: $localize`Iraq`,
        IR: $localize`Iran`,
        IS: $localize`Iceland`,
        IT: $localize`Italy`,
        JE: $localize`Jersey`,
        JM: $localize`Jamaica`,
        JO: $localize`Jordan`,
        JP: $localize`Japan`,
        KE: $localize`Kenya`,
        KG: $localize`Kyrgyzstan`,
        KH: $localize`Cambodia`,
        KI: $localize`Kiribati`,
        KM: $localize`Comoros`,
        KN: $localize`Saint Kitts and Nevis`,
        KP: $localize`North Korea`,
        KR: $localize`South Korea`,
        KW: $localize`Kuwait`,
        KY: $localize`Cayman Islands`,
        KZ: $localize`Kazakhstan`,
        LA: $localize`Laos`,
        LB: $localize`Lebanon`,
        LC: $localize`Saint Lucia`,
        LI: $localize`Liechtenstein`,
        LK: $localize`Sri Lanka`,
        LR: $localize`Liberia`,
        LS: $localize`Lesotho`,
        LT: $localize`Lithuania`,
        LU: $localize`Luxembourg`,
        LV: $localize`Latvia`,
        LY: $localize`Libya`,
        MA: $localize`Morocco`,
        MC: $localize`Monaco`,
        MD: $localize`Moldova`,
        ME: $localize`Montenegro`,
        MF: $localize`Saint Martin`,
        MG: $localize`Madagascar`,
        MH: $localize`Marshall Islands`,
        MK: $localize`Macedonia`,
        ML: $localize`Mali`,
        MM: $localize`Myanmar`,
        MN: $localize`Mongolia`,
        MO: $localize`Macau`,
        MP: $localize`Northern Mariana Islands`,
        MR: $localize`Mauritania`,
        MS: $localize`Montserrat`,
        MT: $localize`Malta`,
        MU: $localize`Mauritius`,
        MV: $localize`Maldives`,
        MW: $localize`Malawi`,
        MX: $localize`Mexico`,
        MY: $localize`Malaysia`,
        MZ: $localize`Mozambique`,
        NA: $localize`Namibia`,
        NC: $localize`New Caledonia`,
        NE: $localize`Niger`,
        NG: $localize`Nigeria`,
        NI: $localize`Nicaragua`,
        NL: $localize`Netherlands`,
        NO: $localize`Norway`,
        NP: $localize`Nepal`,
        NR: $localize`Nauru`,
        NU: $localize`Niue`,
        NZ: $localize`New Zealand`,
        OM: $localize`Oman`,
        PA: $localize`Panama`,
        PE: $localize`Peru`,
        PF: $localize`French Polynesia`,
        PG: $localize`Papua New Guinea`,
        PH: $localize`Philippines`,
        PK: $localize`Pakistan`,
        PL: $localize`Poland`,
        PM: $localize`Saint Pierre and Miquelon`,
        PN: $localize`Pitcairn`,
        PR: $localize`Puerto Rico`,
        PS: $localize`Palestine`,
        PT: $localize`Portugal`,
        PW: $localize`Palau`,
        PY: $localize`Paraguay`,
        QA: $localize`Qatar`,
        RE: $localize`Reunion`,
        RO: $localize`Romania`,
        RS: $localize`Serbia`,
        RU: $localize`Russia`,
        RW: $localize`Rwanda`,
        SA: $localize`Saudi Arabia`,
        SB: $localize`Solomon Islands`,
        SC: $localize`Seychelles`,
        SD: $localize`Sudan`,
        SE: $localize`Sweden`,
        SG: $localize`Singapore`,
        SH: $localize`Saint Helena`,
        SI: $localize`Slovenia`,
        SJ: $localize`Svalbard and Jan Mayen`,
        SK: $localize`Slovakia`,
        SL: $localize`Sierra Leone`,
        SM: $localize`San Marino`,
        SN: $localize`Senegal`,
        SO: $localize`Somalia`,
        SR: $localize`Suriname`,
        SS: $localize`South Sudan`,
        ST: $localize`Sao Tome and Principe`,
        SV: $localize`El Salvador`,
        SX: $localize`Sint Maarten`,
        SY: $localize`Syria`,
        SZ: $localize`Swaziland`,
        TC: $localize`Turks and Caicos Islands`,
        TD: $localize`Chad`,
        TG: $localize`Togo`,
        TH: $localize`Thailand`,
        TJ: $localize`Tajikistan`,
        TK: $localize`Tokelau`,
        TL: $localize`East Timor`,
        TM: $localize`Turkmenistan`,
        TN: $localize`Tunisia`,
        TO: $localize`Tonga`,
        TR: $localize`Turkey`,
        TT: $localize`Trinidad and Tobago`,
        TV: $localize`Tuvalu`,
        TW: $localize`Taiwan`,
        TZ: $localize`Tanzania`,
        UA: $localize`Ukraine`,
        UG: $localize`Uganda`,
        US: $localize`United States`,
        UY: $localize`Uruguay`,
        UZ: $localize`Uzbekistan`,
        VA: $localize`Vatican`,
        VC: $localize`Saint Vincent and the Grenadines`,
        VE: $localize`Venezuela`,
        VG: $localize`British Virgin Islands`,
        VI: $localize`U.S. Virgin Islands`,
        VN: $localize`Vietnam`,
        VU: $localize`Vanuatu`,
        WF: $localize`Wallis and Futuna`,
        WS: $localize`Samoa`,
        XK: $localize`Kosovo`,
        YE: $localize`Yemen`,
        YT: $localize`Mayotte`,
        ZA: $localize`South Africa`,
        ZM: $localize`Zambia`,
        ZW: $localize`Zimbabwe`,
    };

    transform(key: string | null | undefined): string {
        return key ? (CountryNamePipe.NAMES[key] || `[${key}]`) : '';
    }
}
