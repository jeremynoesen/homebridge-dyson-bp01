import {
    AccessoryConfig,
    AccessoryPlugin,
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    HAP,
    Logging,
    Service
} from "homebridge";
import fs from "fs";

let hap: HAP;
const broadlink = require("./broadlink.js");

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("DysonBP01", DysonBP01);
};

class DysonBP01 implements AccessoryPlugin {

    private readonly log: Logging;
    private readonly name: string;
    private readonly fanService: Service;
    private readonly informationService: Service;
    private readonly storagePath: string;

    private device: any;
    private currentPower: boolean;
    private currentSpeed: number;
    private currentOscillation: number;
    private targetPower: boolean;
    private targetSpeed: number;
    private targetOscillation: number;
    private readonly interval: number;

    /**
     * initialize this accessory
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.name = config.name;
        this.storagePath = api.user.storagePath() + "/homebridge-dyson-bp01/";

        try {
            fs.mkdirSync(this.storagePath);
        } catch (e) {
        }

        try {
            let data = fs.readFileSync(this.storagePath + this.name + ".txt").toString().split("\n");
            this.currentPower = this.targetPower = data[0] == "true";
            this.currentSpeed = this.targetSpeed = parseInt(data[1]);
            this.currentOscillation = this.targetOscillation = parseInt(data[2]);
        } catch (e) {
            this.currentPower = this.targetPower = false;
            this.currentSpeed = this.targetSpeed = 1;
            this.currentOscillation = this.targetOscillation = 0;
        }

        log.info(this.name + " power is " + (this.currentPower ? "ON" : "OFF"));
        log.info(this.name + " speed is " + this.currentSpeed);
        log.info(this.name + " oscillation is " + (this.currentOscillation == 1 ? "ON" : "OFF"));

        this.fanService = new hap.Service.Fanv2(this.name);

        this.fanService.getCharacteristic(hap.Characteristic.On)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, this.currentPower);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.targetPower = value as boolean;
                log.info(this.name + " power set to " + (this.targetPower ? "ON" : "OFF"));
                callback();
            });
        this.fanService.getCharacteristic(hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, this.currentPower);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                callback();
            });

        this.fanService.getCharacteristic(hap.Characteristic.RotationSpeed)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, this.currentSpeed * 10);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.targetSpeed = Math.ceil((value as number) / 10);
                log.info(this.name + " speed set to " + this.targetSpeed);
                callback();
            });

        this.fanService.getCharacteristic(hap.Characteristic.SwingMode)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, this.currentOscillation);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.targetOscillation = value as number;
                log.info(this.name + " oscillation set to " + (this.targetOscillation == 1 ? "ON" : "OFF"));
                callback();
            });

        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Manufacturer, "Dyson")
            .setCharacteristic(hap.Characteristic.Model, "BP01");

        if (config.interval) {
            this.interval = config.interval;
        } else {
            this.interval = 650;
        }

        broadlink.discover();

        // @ts-ignore
        broadlink.on("deviceReady", device => {
            if (config.host && this.device == null) {
                if (device.host.address.toString() == config.host) {
                    this.device = device;
                    this.loop()
                    log.info(this.name + " discovered manually on " + device.host.address.toString());
                }
            } else if (this.device == null) {
                this.device = device;
                this.loop()
                log.info(this.name + " discovered automatically on " + device.host.address.toString());
            }
        });
    }

    /**
     * start the loop for updating this accessory properly
     */
    async loop(): Promise<void> {
        let oscillationSkip = 0;

        setInterval(() => {

            if (this.currentPower != this.targetPower && oscillationSkip == 0) {
                this.device.sendData(Buffer.from("260050004a1618191719181819301719181818181819173118191818181919171818181818191917183018181819183018000699481818311900068c471918301800068e481817321900068c4719183018000d050000000000000000", "hex"));
                this.currentPower = this.targetPower;
            } else if (this.currentSpeed < this.targetSpeed && this.currentPower && oscillationSkip == 0) {
                this.device.sendData(Buffer.from("260050004719171a1718181818311818181818191917183018181a2e19181830171a17301b2e1831171918301731181917000685471917311800068d481818311a00068c481818311800068d4719183018000d050000000000000000", "hex"));
                this.currentSpeed += 1;
            } else if (this.currentSpeed > this.targetSpeed && this.currentPower && oscillationSkip == 0) {
                this.device.sendData(Buffer.from("26005800481818191818171918301819191718181917183118181830181917311830171a17191a2e18181819183018311700069d471917311800068e481818311700068f471818311800068e491818301800068e4719183018000d05", "hex"));
                this.currentSpeed -= 1;
            } else if (this.currentOscillation != this.targetOscillation && this.currentPower) {
                this.device.sendData(Buffer.from("2600580048181819171918181830181918181818181818311819171918301830181917191830173118181a2e1819171918000692491818301800068d471918301800068d481818311800068e471818311900068c4818193018000d05", "hex"));
                this.currentOscillation = this.targetOscillation;
                oscillationSkip = Math.ceil(3000 / this.interval);
            }

            if (oscillationSkip > 0) oscillationSkip--;

            fs.writeFileSync(this.storagePath + this.name + ".txt", this.currentPower + "\n" + this.currentSpeed + "\n" + this.currentOscillation);
        }, this.interval);
    }

    /**
     * get the services for this accessory
     */
    getServices(): Service[] {
        return [
            this.informationService,
            this.fanService,
        ];
    }

    /**
     * called when identifying the accessory in HomeKit
     */
    identify(): void {
        this.log.info(this.name + " identified!");
    }
}
