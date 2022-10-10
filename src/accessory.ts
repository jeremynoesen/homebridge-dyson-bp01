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
     * Target active characteristic to set the fan to
     * @private
     */
    private targetActive: number;

    /**
     * Current rotation speed
     * @private
     */
    private currentRotationSpeed: number;

    /**
     * Target rotation speed to set the fan to
     * @private
     */
    private targetRotationSpeed: number;

    /**
     * Current swing mode of the fan
     * @private
     */
    private currentSwingMode: number;

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
        this.interval = config.interval || 500;
        this.serial = config.serial;

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
     * Initialize the information service for this accessory
     * @private
     */
    private initInformationService() {
        this.informationService
            .updateCharacteristic(hap.Characteristic.Manufacturer, "Dyson")
            .updateCharacteristic(hap.Characteristic.Model, "BP01")
            .updateCharacteristic(hap.Characteristic.SerialNumber, this.serial ? this.serial.toUpperCase() : "Printed on machine");
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
     * Get the services for this accessory
     */
    getServices(): Service[] {
        return [
            this.informationService,
            this.fanService,
        ];
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
     * Load the previous or initial characteristics of the accessory
     * @private
     */
    private async initCharacteristics() {
        await this.initActive();
        await this.initRotationSpeed();
        await this.initSwingMode();
    }

    /**
     * Update the current characteristics of the accessory in the order of active, rotation speed, then swing mode
     * @private
     */
    private async updateCharacteristics() {
        if (this.canUpdateActive()) {
            await this.updateActive();
        } else if (this.canUpdateRotationSpeedUp()) {
            await this.updateRotationSpeedUp();
        } else if (this.canUpdateRotationSpeedDown()) {
            await this.updateRotationSpeedDown();
        } else if (this.canUpdateSwingMode()) {
            await this.updateSwingMode();
        }
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
        this.device.sendData(Buffer.from("260038004519151a161917171a2d1917161816191718172f19181619161817181719161916181718173018171630161a1600066c4717163017000d050000000000000000000000000000", "hex"));
        this.currentActive = this.targetActive;
        await this.storage.setItem(this.name + " active", this.currentActive);
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
     * Check if the current rotation speed can be increased
     * @private
     */
    private canUpdateRotationSpeedUp(): boolean {
        return this.currentRotationSpeed < this.targetRotationSpeed && this.currentActive == hap.Characteristic.Active.ACTIVE && this.swingModeSkip == 0;
    }

    /**
     * Increase current rotation speed based on the target rotation speed
     * @private
     */
    private async updateRotationSpeedUp() {
        this.device.sendData(Buffer.from("26003800441a151b14191817192d171819171816181717301917163018181530171a1530182d182f19161630192e182e1900065f4616192e19000d050000000000000000000000000000", "hex"));
        this.currentRotationSpeed += 10;
        await this.storage.setItem(this.name + " rotation-speed", this.currentRotationSpeed);
    }

    /**
     * Check if the current rotation speed can be decreased
     * @private
     */
    private canUpdateRotationSpeedDown(): boolean {
        return this.currentRotationSpeed > this.targetRotationSpeed && this.currentActive == hap.Characteristic.Active.ACTIVE && this.swingModeSkip == 0;
    }

    /**
     * Decrease current rotation speed based on the target rotation speed
     * @private
     */
    private async updateRotationSpeedDown() {
        this.device.sendData(Buffer.from("260038004815181817181916182e161819171619161916301619172f19161730192d19161917172f1619161917181630190006664717192d19000d050000000000000000000000000000", "hex"));
        this.currentRotationSpeed -= 10;
        await this.storage.setItem(this.name + " rotation-speed", this.currentRotationSpeed);
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
        this.device.sendData(Buffer.from("26003800451718181618191617301817161817181719163018171619172f192d191716191630192e181716301630192d190006584716163018000d050000000000000000000000000000", "hex"));
        this.currentSwingMode = this.targetSwingMode;
        this.swingModeSkip = Math.ceil(3000 / (this.interval));
        await this.storage.setItem(this.name + " swing-mode", this.currentSwingMode);
    }
}
