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
import storage from "node-persist";

let hap: HAP;
const broadlink = require("./broadlink.js");

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("DysonBP01", DysonBP01);
};

class DysonBP01 implements AccessoryPlugin {
    private readonly log: Logging;
    private readonly name: string;
    private readonly mac: string;
    private readonly interval: number;
    private readonly fanService: Service;
    private readonly informationService: Service;
    private readonly storage: any;
    private device: any;
    private currentPower = false;
    private currentSpeed = 1;
    private currentOscillation = 0;
    private targetPower = false;
    private targetSpeed = 1;
    private targetOscillation = 0;

    /**
     * initialize the homebridge accessory
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.name = config.name;
        this.mac = config.mac;
        this.interval = config.interval || 650;
        this.storage = storage.create();
        this.storage.init({dir: api.user.persistPath(), forgiveParseErrors: true});
        this.fanService = new hap.Service.Fanv2(this.name);
        this.fanService.getCharacteristic(hap.Characteristic.On)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, this.currentPower);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.targetPower = value as boolean;
                this.log.info("Power set to " + (this.targetPower ? "ON" : "OFF"));
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
                this.targetSpeed = (value as number) / 10;
                this.log.info("Speed set to " + this.targetSpeed);
                callback();
            })
            .setProps({
                minStep: 10
            });
        this.fanService.getCharacteristic(hap.Characteristic.SwingMode)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, this.currentOscillation);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.targetOscillation = value as number;
                this.log.info("Oscillation set to " + (this.targetOscillation == 1 ? "ON" : "OFF"));
                callback();
            });
        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Manufacturer, "Dyson")
            .setCharacteristic(hap.Characteristic.Model, "BP01");
        this.init().then(() => {
        });
    }

    /**
     * initialize the accessory states and broadlink rm
     */
    private async init() {
        this.currentPower = this.targetPower = await this.storage.getItem(this.name + " power") || false;
        this.currentSpeed = this.targetSpeed = await this.storage.getItem(this.name + " speed") || 1;
        this.currentOscillation = this.targetOscillation = await this.storage.getItem(this.name + " oscillation") || 0;
        this.log.info("Power is " + (this.currentPower ? "ON" : "OFF"));
        this.log.info("Speed is " + this.currentSpeed);
        this.log.info("Oscillation is " + (this.currentOscillation == 1 ? "ON" : "OFF"));
        broadlink.discover();
        this.log.info("Searching for BroadLink RM...");
        broadlink.on("deviceReady", device => {
            if (this.device == null && (!this.mac || device.mac.toString("hex") == this.mac.split(":").join(""))) {
                this.device = device;
                this.log.info("BroadLink RM discovered!");
                let oscillationSkip = 0;
                setInterval(async () => {
                    if (this.currentPower != this.targetPower) {
                        this.device.sendData(Buffer.from("260050004a1618191719181819301719181818181819173118191818181919171818181818191917183018181819183018000699481818311900068c471918301800068e481817321900068c4719183018000d050000000000000000", "hex"));
                        this.currentPower = this.targetPower;
                        await this.storage.setItem(this.name + " power", this.currentPower);
                    } else if (this.currentSpeed < this.targetSpeed && this.currentPower && oscillationSkip == 0) {
                        this.device.sendData(Buffer.from("260050004719171a1718181818311818181818191917183018181a2e19181830171a17301b2e1831171918301731181917000685471917311800068d481818311a00068c481818311800068d4719183018000d050000000000000000", "hex"));
                        this.currentSpeed += 1;
                        await this.storage.setItem(this.name + " speed", this.currentSpeed);
                    } else if (this.currentSpeed > this.targetSpeed && this.currentPower && oscillationSkip == 0) {
                        this.device.sendData(Buffer.from("26005800481818191818171918301819191718181917183118181830181917311830171a17191a2e18181819183018311700069d471917311800068e481818311700068f471818311800068e491818301800068e4719183018000d05", "hex"));
                        this.currentSpeed -= 1;
                        await this.storage.setItem(this.name + " speed", this.currentSpeed);
                    } else if (this.currentOscillation != this.targetOscillation && this.currentPower) {
                        this.device.sendData(Buffer.from("2600580048181819171918181830181918181818181818311819171918301830181917191830173118181a2e1819171918000692491818301800068d471918301800068d481818311800068e471818311900068c4818193018000d05", "hex"));
                        this.currentOscillation = this.targetOscillation;
                        await this.storage.setItem(this.name + " oscillation", this.currentOscillation);
                        oscillationSkip = Math.ceil(3000 / this.interval);
                    }
                    if (oscillationSkip > 0) oscillationSkip--;
                }, this.interval);
            }
        });
    }

    /**
     * identify the accessory
     */
    identify(): void {
        this.log.info("Identified!");
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
}
