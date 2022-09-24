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

/**
 * Dyson BP01 accessory for Homebridge
 *
 * @author Jeremy Noesen
 */
class DysonBP01 implements AccessoryPlugin {

    /**
     * Information service to provide accessory details in Homebridge
     * @private
     */
    private readonly informationService: Service;

    /**
     * Fan service to add a fan to Homebridge
     * @private
     */
    private readonly fanService: Service;

    /**
     * Logger
     * @private
     */
    private readonly log: Logging;

    /**
     * Accessory name
     * @private
     */
    private readonly name: string;

    /**
     * MAC address of BroadLink RM (if configured)
     * @private
     */
    private readonly mac: string;

    /**
     * Loop interval
     * @private
     */
    private readonly interval: number;

    /**
     * Node-persist storage to keep track of previous states across reboots
     * @private
     */
    private readonly storage: any;

    /**
     * BroadLink RM device
     * @private
     */
    private remote: any;

    /**
     * Current power state of the fan
     * @private
     */
    private currentPower: number;

    /**
     * Current fan speed
     * @private
     */
    private currentSpeed: number;

    /**
     * Current oscillation state of the fan
     * @private
     */
    private currentOscillation: number;

    /**
     * Target power state to set the fan to
     * @private
     */
    private targetPower: number;

    /**
     * Target speed to set the fan to
     * @private
     */
    private targetSpeed: number;

    /**
     * Target oscillation state to set the fan to
     * @private
     */
    private targetOscillation: number;

    /**
     * Used to add delays before speed signals after oscillation is updated
     * @private
     */
    private oscillationSkip: number;

    /**
     * Create the DysonBP01 accessory
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;

        this.name = config.name;
        this.mac = config.mac;
        this.interval = config.interval || 650;

        this.remote = null;
        this.currentPower = this.targetPower = 0;
        this.currentSpeed = this.targetSpeed = 1;
        this.currentOscillation = this.targetOscillation = 0;
        this.oscillationSkip = 0;

        this.storage = storage.create();
        this.storage.init({dir: api.user.persistPath(), forgiveParseErrors: true});

        this.informationService = new hap.Service.AccessoryInformation();
        this.initInfoService();

        this.fanService = new hap.Service.Fanv2(config.name);
        this.initFanService();

        this.initStates().then(() => {
            this.initRemote();
        });
    }

    /**
     * Initialize the information service for this accessory
     * @private
     */
    private initInfoService() {
        this.informationService
            .setCharacteristic(hap.Characteristic.Manufacturer, "Dyson")
            .setCharacteristic(hap.Characteristic.Model, "BP01")
            .setCharacteristic(hap.Characteristic.SerialNumber, "Printed on device");
    }

    /**
     * Initialize the fan service for this accessory
     * @private
     */
    private initFanService() {
        this.fanService.getCharacteristic(hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, this.currentPower);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.setTargetPower(value);
                callback();
            });

        this.fanService.getCharacteristic(hap.Characteristic.RotationSpeed)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, this.currentSpeed * 10);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.setTargetSpeed(value);
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
                this.setTargetOscillation(value);
                callback();
            });
    }

    /**
     * Set the target power state
     *
     * @param value value received from Homebridge
     * @private
     */
    private setTargetPower(value: CharacteristicValue) {
        this.targetPower = value as number;

        if (this.targetPower != this.currentPower) {
            this.log.info("Power set to " + (this.targetPower ? "ON" : "OFF"));
        }
    }

    /**
     * Set the target fan speed
     *
     * @param value value received from Homebridge
     * @private
     */
    private setTargetSpeed(value: CharacteristicValue) {
        this.targetSpeed = (value as number) / 10;

        if (this.targetSpeed != this.currentSpeed) {
            this.log.info("Speed set to " + this.targetSpeed);
        }
    }

    /**
     * Set the target oscillation state
     *
     * @param value value received from Homebridge
     * @private
     */
    private setTargetOscillation(value: CharacteristicValue) {
        this.targetOscillation = value as number;

        if (this.targetOscillation != this.currentOscillation) {
            this.log.info("Oscillation set to " + (this.targetOscillation == 1 ? "ON" : "OFF"));
        }
    }

    /**
     * Load the previous or initial states of the accessory
     * @private
     */
    private async initStates() {
        await this.initPower();
        await this.initSpeed();
        await this.initOscillation();
    }

    /**
     * Initialize the power state, either for the first time or from the last known state
     * @private
     */
    private async initPower() {
        this.currentPower = this.targetPower = await this.storage.getItem(this.name + " power") || false;

        this.log.info("Power is " + (this.currentPower ? "ON" : "OFF"));
    }

    /**
     * Initialize the fan speed, either for the first time or from the last known state
     * @private
     */
    private async initSpeed() {
        this.currentSpeed = this.targetSpeed = await this.storage.getItem(this.name + " speed") || 1;

        this.log.info("Speed is " + this.currentSpeed);
    }

    /**
     * Initialize the oscillation state, either for the first time or from the last known state
     * @private
     */
    private async initOscillation() {
        this.currentOscillation = this.targetOscillation = await this.storage.getItem(this.name + " oscillation") || 0;

        this.log.info("Oscillation is " + (this.currentOscillation == 1 ? "ON" : "OFF"));
    }

    /**
     * Search for a BroadLink RM
     * @private
     */
    private initRemote() {
        broadlink.discover();
        broadlink.on("deviceReady", device => {
            this.setRemote(device);
        });

        this.log.info("Searching for BroadLink RM...");
    }

    /**
     * Set the remote to the found BroadLink RM
     * @param device device found to set as remote
     * @private
     */
    private setRemote(device: any) {
        if (this.remote == null && (!this.mac || device.mac.toString("hex").toUpperCase() == this.mac.split(":").join("").toUpperCase())) {
            this.remote = device;
            this.initLoop();

            this.log.info("BroadLink RM discovered!");
        }
    }

    /**
     * Start the loop that updates the accessory states
     * @private
     */
    private initLoop() {
        setInterval(async () => {
            if (this.currentPower != this.targetPower) {
                await this.updateCurrentPower();
            } else if (this.currentSpeed < this.targetSpeed && this.currentPower && this.oscillationSkip == 0) {
                await this.increaseCurrentSpeed();
            } else if (this.currentSpeed > this.targetSpeed && this.currentPower && this.oscillationSkip == 0) {
                await this.decreaseCurrentSpeed();
            } else if (this.currentOscillation != this.targetOscillation && this.currentPower) {
                await this.updateCurrentOscillation();
                this.oscillationSkip = Math.ceil(3000 / (this.interval));
            }
            if (this.oscillationSkip > 0) this.oscillationSkip--;
        }, this.interval);
    }

    /**
     * Update current power based on the target power
     * @private
     */
    private async updateCurrentPower() {
        this.remote.sendData(Buffer.from("260050004a1618191719181819301719181818181819173118191818181919171818181818191917183018181819183018000699481818311900068c471918301800068e481817321900068c4719183018000d050000000000000000", "hex"));
        this.currentPower = this.targetPower;
        await this.storage.setItem(this.name + " power", this.currentPower);
    }

    /**
     * Update current speed based on the target speed upwards
     * @private
     */
    private async increaseCurrentSpeed() {
        this.remote.sendData(Buffer.from("260050004719171a1718181818311818181818191917183018181a2e19181830171a17301b2e1831171918301731181917000685471917311800068d481818311a00068c481818311800068d4719183018000d050000000000000000", "hex"));
        this.currentSpeed += 1;
        await this.storage.setItem(this.name + " speed", this.currentSpeed);
    }

    /**
     * Update current speed based on the target speed downwards
     * @private
     */
    private async decreaseCurrentSpeed() {
        this.remote.sendData(Buffer.from("26005800481818191818171918301819191718181917183118181830181917311830171a17191a2e18181819183018311700069d471917311800068e481818311700068f471818311800068e491818301800068e4719183018000d05", "hex"));
        this.currentSpeed -= 1;
        await this.storage.setItem(this.name + " speed", this.currentSpeed);
    }

    /**
     * Update current oscillation based on the target oscillation
     * @private
     */
    private async updateCurrentOscillation() {
        this.remote.sendData(Buffer.from("2600580048181819171918181830181918181818181818311819171918301830181917191830173118181a2e1819171918000692491818301800068d471918301800068d481818311800068e471818311900068c4818193018000d05", "hex"));
        this.currentOscillation = this.targetOscillation;
        await this.storage.setItem(this.name + " oscillation", this.currentOscillation);
    }

    /**
     * Get the services for this accessory
     */
    getServices(): Service[] {
        return [
            this.informationService,
            this.fanService,
        ];
    }
}
