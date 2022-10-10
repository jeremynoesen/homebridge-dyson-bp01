import {
    AccessoryConfig,
    AccessoryPlugin,
    API,
    CharacteristicValue,
    HAP,
    Logging,
    Service
} from "homebridge";
import storage from "node-persist";

import ping from "ping";

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
     * MAC address of BroadLink RM
     * @private
     */
    private readonly mac: string;

    /**
     * Loop interval
     * @private
     */
    private readonly interval: number;

    /**
     * Serial number of Dyson BP01
     * @private
     */
    private readonly serial: string;

    /**
     * Node-persist storage to keep track of characteristics
     * @private
     */
    private readonly storage: any;

    /**
     * BroadLink RM
     * @private
     */
    private device: any;

    /**
     * Current active characteristic of the fan
     * @private
     */
    private currentActive: number;

    /**
     * Current rotation speed
     * @private
     */
    private currentRotationSpeed: number;

    /**
     * Current swing mode of the fan
     * @private
     */
    private currentSwingMode: number;

    /**
     * Target active characteristic to set the fan to
     * @private
     */
    private targetActive: number;

    /**
     * Target rotation speed to set the fan to
     * @private
     */
    private targetRotationSpeed: number;

    /**
     * Target swing mode to set the fan to
     * @private
     */
    private targetSwingMode: number;

    /**
     * Used to add delays before rotation speed signals after swing mode is updated
     * @private
     */
    private swingModeSkip: number;

    /**
     * Used to add delay after the BroadLink RM reconnects
     * @private
     */
    private deviceSkip: boolean;

    /**
     * Create the DysonBP01 accessory
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;

        this.name = config.name;
        this.mac = config.mac;
        this.interval = config.interval || 650;
        this.serial = config.serial || "PRINTED ON MACHINE";

        this.device = null;
        this.currentActive = this.targetActive = hap.Characteristic.Active.INACTIVE;
        this.currentRotationSpeed = this.targetRotationSpeed = 10;
        this.currentSwingMode = this.targetSwingMode = hap.Characteristic.SwingMode.SWING_DISABLED;
        this.swingModeSkip = 0;
        this.deviceSkip = false;

        this.storage = storage.create();
        this.storage.init({dir: api.user.persistPath(), forgiveParseErrors: true});

        this.informationService = new hap.Service.AccessoryInformation();
        this.initInformationService();

        this.fanService = new hap.Service.Fanv2(config.name);
        this.initFanService();

        this.initCharacteristics().then(() => {
            this.initDevice();
        });
    }

    /**
     * Initialize the information service for this accessory
     * @private
     */
    private initInformationService() {
        this.informationService
            .updateCharacteristic(hap.Characteristic.Manufacturer, "Dyson")
            .updateCharacteristic(hap.Characteristic.Model, "BP01")
            .updateCharacteristic(hap.Characteristic.SerialNumber, this.serial.toUpperCase());
    }

    /**
     * Initialize the fan service for this accessory
     * @private
     */
    private initFanService() {
        this.fanService.getCharacteristic(hap.Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));

        this.fanService.getCharacteristic(hap.Characteristic.RotationSpeed)
            .onGet(this.getRotationSpeed.bind(this))
            .onSet(this.setRotationSpeed.bind(this))
            .setProps({
                minStep: 10
            });

        this.fanService.getCharacteristic(hap.Characteristic.SwingMode)
            .onGet(this.getSwingMode.bind(this))
            .onSet(this.setSwingMode.bind(this));
    }

    /**
     * Get the active characteristic
     * @private
     */
    private async getActive(): Promise<CharacteristicValue> {
        return this.targetActive;
    }

    /**
     * Set the active characteristic
     *
     * @param value value received from Homebridge
     * @private
     */
    private async setActive(value: CharacteristicValue): Promise<void> {
        this.targetActive = value as number;

        this.log.info("Power set to " + (this.targetActive == hap.Characteristic.Active.ACTIVE ? "ON" : "OFF"));
    }

    /**
     * Get the rotation speed
     * @private
     */
    private async getRotationSpeed(): Promise<CharacteristicValue> {
        return this.targetRotationSpeed;
    }

    /**
     * Set the rotation speed
     *
     * @param value value received from Homebridge
     * @private
     */
    private async setRotationSpeed(value: CharacteristicValue): Promise<void> {
        this.targetRotationSpeed = Math.max(10, value as number);

        this.log.info("Fan speed set to " + (this.targetRotationSpeed / 10));
    }

    /**
     * Get the swing mode
     * @private
     */
    private async getSwingMode(): Promise<CharacteristicValue> {
        return this.targetSwingMode;
    }

    /**
     * Set the swing mode
     *
     * @param value value received from Homebridge
     * @private
     */
    private async setSwingMode(value: CharacteristicValue): Promise<void> {
        this.targetSwingMode = value as number;

        this.log.info("Oscillation set to " + (this.targetSwingMode == hap.Characteristic.SwingMode.SWING_ENABLED ? "ON" : "OFF"));
    }

    /**
     * Load the previous or initial characteristics of the accessory
     * @private
     */
    private async initCharacteristics() {
        await this.initActive();
        await this.initRotationSpeed();
        await this.initSwingMode();
    }

    /**
     * Initialize the active characteristic, either for the first time or from the last known characteristic
     * @private
     */
    private async initActive() {
        this.currentActive = this.targetActive = await this.storage.getItem(this.name + " active") || hap.Characteristic.Active.INACTIVE;

        this.log.info("Power is " + (this.currentActive == hap.Characteristic.Active.ACTIVE ? "ON" : "OFF"));
    }

    /**
     * Initialize the rotation speed, either for the first time or from the last known characteristic
     * @private
     */
    private async initRotationSpeed() {
        this.currentRotationSpeed = this.targetRotationSpeed = await this.storage.getItem(this.name + " rotation-speed") || 10;

        this.log.info("Fan speed is " + (this.currentRotationSpeed / 10));
    }

    /**
     * Initialize the swing mode, either for the first time or from the last known characteristic
     * @private
     */
    private async initSwingMode() {
        this.currentSwingMode = this.targetSwingMode = await this.storage.getItem(this.name + " swing-mode") || hap.Characteristic.SwingMode.SWING_DISABLED;

        this.log.info("Oscillation is " + (this.currentSwingMode == hap.Characteristic.SwingMode.SWING_ENABLED ? "ON" : "OFF"));
    }

    /**
     * Search for a BroadLink RM
     * @private
     */
    private initDevice() {
        broadlink.discover();
        broadlink.on("deviceReady", device => {
            this.setDevice(device);
        });

        this.log.info("Searching for BroadLink RM...");
    }

    /**
     * Use the found BroadLink RM
     * @param device BroadLink RM
     * @private
     */
    private setDevice(device: any) {
        if (this.isDeviceValid(device)) {
            this.device = device;
            this.initLoop();

            this.log.info("BroadLink RM discovered!");
        }
    }

    /**
     * Check that the found BroadLink RM is valid
     * @param device BroadLink RM
     * @private
     */
    private isDeviceValid(device: any): boolean {
        return this.device == null && (!this.mac || device.mac.toString("hex")
            .replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase() == this.mac.toUpperCase());
    }

    /**
     * Start the loop that updates the accessory characteristics
     * @private
     */
    private initLoop() {
        setInterval(async () => {

            if (await this.isDeviceConnected()) {
                await this.updateCharacteristics();
            }

            if (this.swingModeSkip > 0) {
                this.swingModeSkip--;
            }

        }, this.interval);
    }

    /**
     * Check if the BroadLink RM is connected
     * @private
     */
    private async isDeviceConnected(): Promise<boolean> {
        const connected = await ping.promise.probe(this.device.host.address).then((res) => {
            return res.alive
        });

        if (!connected) {
            this.deviceSkip = true;
            this.log.error("Failed to ping BroadLink RM!");
        } else if (this.deviceSkip) {
            this.deviceSkip = false;
            return false;
        }

        return connected;
    }

    /**
     * Update the current characteristics of the accessory in the order of active, rotation speed, then swing mode
     * @private
     */
    private async updateCharacteristics() {
        if (this.canUpdateActive()) {
            await this.updateActive();
        } else if (this.canIncreaseRotationSpeed()) {
            await this.increaseRotationSpeed();
        } else if (this.canDecreaseRotationSpeed()) {
            await this.decreaseRotationSpeed();
        } else if (this.canUpdateSwingMode()) {
            await this.updateSwingMode();
        }
    }

    /**
     * Check if the current active characteristic can be updated
     * @private
     */
    private canUpdateActive(): boolean {
        return this.currentActive != this.targetActive;
    }

    /**
     * Update current active characteristic based on the target active
     * @private
     */
    private async updateActive() {
        this.device.sendData(Buffer.from("260050004a1618191719181819301719181818181819173118191818181919171818181818191917183018181819183018000699481818311900068c471918301800068e481817321900068c4719183018000d050000000000000000", "hex"));
        this.currentActive = this.targetActive;
        await this.storage.setItem(this.name + " active", this.currentActive);
    }

    /**
     * Check if the current rotation speed can be increased
     * @private
     */
    private canIncreaseRotationSpeed(): boolean {
        return this.currentRotationSpeed < this.targetRotationSpeed && this.currentActive == hap.Characteristic.Active.ACTIVE && this.swingModeSkip == 0;
    }

    /**
     * Increase current rotation speed based on the target rotation speed
     * @private
     */
    private async increaseRotationSpeed() {
        this.device.sendData(Buffer.from("260050004719171a1718181818311818181818191917183018181a2e19181830171a17301b2e1831171918301731181917000685471917311800068d481818311a00068c481818311800068d4719183018000d050000000000000000", "hex"));
        this.currentRotationSpeed += 10;
        await this.storage.setItem(this.name + " rotation-speed", this.currentRotationSpeed);
    }

    /**
     * Check if the current rotation speed can be decreased
     * @private
     */
    private canDecreaseRotationSpeed(): boolean {
        return this.currentRotationSpeed > this.targetRotationSpeed && this.currentActive == hap.Characteristic.Active.ACTIVE && this.swingModeSkip == 0;
    }

    /**
     * Decrease current rotation speed based on the target rotation speed
     * @private
     */
    private async decreaseRotationSpeed() {
        this.device.sendData(Buffer.from("26005800481818191818171918301819191718181917183118181830181917311830171a17191a2e18181819183018311700069d471917311800068e481818311700068f471818311800068e491818301800068e4719183018000d05", "hex"));
        this.currentRotationSpeed -= 10;
        await this.storage.setItem(this.name + " rotation-speed", this.currentRotationSpeed);
    }

    /**
     * Check if the current swing mode can be updated
     * @private
     */
    private canUpdateSwingMode(): boolean {
        return this.currentSwingMode != this.targetSwingMode && this.currentActive == hap.Characteristic.Active.ACTIVE;
    }

    /**
     * Update current swing mode based on the target swing mode
     * @private
     */
    private async updateSwingMode() {
        this.device.sendData(Buffer.from("2600580048181819171918181830181918181818181818311819171918301830181917191830173118181a2e1819171918000692491818301800068d471918301800068d481818311800068e471818311900068c4818193018000d05", "hex"));
        this.currentSwingMode = this.targetSwingMode;
        this.swingModeSkip = Math.ceil(3000 / (this.interval));
        await this.storage.setItem(this.name + " swing-mode", this.currentSwingMode);
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
