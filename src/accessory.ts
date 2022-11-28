import {AccessoryConfig, AccessoryPlugin, API, CharacteristicValue, HAP, Logging, Service} from "homebridge";
import storage from "node-persist";
import ping from "ping";
import * as constants from "./helpers/constants";
import * as messages from "./helpers/messages";

const broadlink = require("./helpers/broadlink");
let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory(constants.ACCESSORY_ID, DysonBP01);
};

/**
 * Dyson BP01 accessory for Homebridge
 */
class DysonBP01 implements AccessoryPlugin {

    /**
     * Information service to provide accessory information
     * @private
     */
    private readonly informationService: Service;

    /**
     * Fan service to add fan controls to accessory
     * @private
     */
    private readonly fanService: Service;

    /**
     * Homebridge logger
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
     * Node-persist storage
     * @private
     */
    private readonly storage: any;

    /**
     * BroadLink RM
     * @private
     */
    private device: any;

    /**
     * Current active state of the fan
     * @private
     */
    private currentActive: number;

    /**
     * Target active state to set the fan to
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
     * Loop skips applied after active is updated
     * @private
     */
    private activeSkips: number;

    /**
     * Loop skips applied after swing mode is updated
     * @private
     */
    private swingModeSkips: number;

    /**
     * Loop skips applied after the BroadLink RM reconnects
     * @private
     */
    private deviceSkips: number;

    /**
     * Create the DysonBP01 accessory
     * @param log Homebridge logging instance
     * @param config Homebridge config
     * @param api Homebridge API
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.name = config.name;
        this.mac = config.mac;
        this.device = null;
        this.currentActive = this.targetActive = hap.Characteristic.Active.INACTIVE;
        this.currentRotationSpeed = this.targetRotationSpeed = constants.STEP_SIZE;
        this.currentSwingMode = this.targetSwingMode = hap.Characteristic.SwingMode.SWING_DISABLED;
        this.activeSkips = this.swingModeSkips = this.deviceSkips = 0;
        this.informationService = new hap.Service.AccessoryInformation();
        this.fanService = new hap.Service.Fanv2(config.name);
        this.storage = storage.create();
        this.storage.init({dir: api.user.persistPath(), forgiveParseErrors: true});
        this.initInformationService();
        this.initFanService();
        this.initActive()
            .then(() => this.initRotationSpeed()
                .then(() => this.initSwingMode()
                    .then(() => {
                        this.initDevice();
                        this.initLoop()
                    })));
    }

    /**
     * Start the loop that updates the accessory
     * @private
     */
    private initLoop(): void {
        setInterval(async () => {
            if (this.device == null) {
                broadlink.discover();
            } else {
                if (await this.isDeviceConnected()) {
                    if (this.canUpdateActive()) {
                        await this.updateActive();
                    } else if (this.canUpdateRotationSpeed()) {
                        await this.updateRotationSpeed();
                    } else if (this.canUpdateSwingMode()) {
                        await this.updateSwingMode();
                    }
                }
                this.doActiveSkip();
                this.doSwingModeSkip();
                this.doDeviceSkip();
            }
        }, constants.INTERVAL);
    }

    /**
     * Initialize the fan service for this accessory
     * @private
     */
    private initFanService(): void {
        this.fanService.getCharacteristic(hap.Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));
        this.fanService.getCharacteristic(hap.Characteristic.RotationSpeed)
            .onGet(this.getRotationSpeed.bind(this))
            .onSet(this.setRotationSpeed.bind(this))
            .setProps({
                minStep: constants.STEP_SIZE
            });
        this.fanService.getCharacteristic(hap.Characteristic.SwingMode)
            .onGet(this.getSwingMode.bind(this))
            .onSet(this.setSwingMode.bind(this));
    }

    /**
     * Initialize the information service for this accessory
     * @private
     */
    private initInformationService(): void {
        this.informationService
            .updateCharacteristic(hap.Characteristic.Manufacturer, messages.INFO_MANUFACTURER)
            .updateCharacteristic(hap.Characteristic.Model, messages.INFO_MODEL)
            .updateCharacteristic(hap.Characteristic.SerialNumber, messages.INFO_SERIAL_NUMBER);
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
     * Identify the accessory through HomeKit
     */
    identify(): void {
        if (this.device == null) {
            this.log.info(messages.IDENTIFY_NOT_CONNECTED);
        } else {
            this.log.info(messages.IDENTIFY_CONNECTED.replace(constants.PLACEHOLDER,
                this.device.mac.toString("hex").replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase()));
        }
    }

    /**
     * Search for a BroadLink RM
     * @private
     */
    private initDevice(): void {
        broadlink.on("deviceReady", device => {
            let mac = device.mac.toString("hex").replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase();
            if (this.device == null && (!this.mac || mac == this.mac.toUpperCase())) {
                this.device = device;
                this.log.info(messages.DEVICE_DISCOVERED.replace(constants.PLACEHOLDER, mac));
            }
        });
        this.log.info(messages.DEVICE_SEARCHING);
    }

    /**
     * Check if the BroadLink RM is connected
     * @private
     */
    private async isDeviceConnected(): Promise<boolean> {
        let connected = await ping.promise.probe(this.device.host.address).then((res) => {
            return res.alive;
        });
        if (!connected) {
            if (this.deviceSkips == 0) {
                this.log.info(messages.DEVICE_RECONNECTING);
            }
            this.deviceSkips = constants.SKIPS_DEVICE;
        } else if (this.deviceSkips > 0) {
            connected = false;
        }
        return connected;
    }

    /**
     * Decrement device skips
     * @private
     */
    private doDeviceSkip(): void {
        if (this.deviceSkips > 0) {
            this.deviceSkips--;
            if (this.deviceSkips == 0) {
                this.log.info(messages.DEVICE_RECONNECTED);
            }
        }
    }

    /**
     * Initialize the active characteristic from a previous saved state or from defaults
     * @private
     */
    private async initActive(): Promise<void> {
        this.currentActive = await this.storage.getItem(constants.STORAGE_CURRENT_ACTIVE
            .replace(constants.PLACEHOLDER, this.name)) || hap.Characteristic.Active.INACTIVE;
        this.targetActive = await this.storage.getItem(constants.STORAGE_TARGET_ACTIVE
            .replace(constants.PLACEHOLDER, this.name)) || hap.Characteristic.Active.INACTIVE;
        this.log.info(messages.ACTIVE_INIT
            .replace(constants.PLACEHOLDER, this.targetActive + ""));
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
     * @param value value received from Homebridge
     * @private
     */
    private async setActive(value: CharacteristicValue): Promise<void> {
        if (value as number != this.targetActive) {
            this.targetActive = value as number;
            await this.storage.setItem(constants.STORAGE_TARGET_ACTIVE
                .replace(constants.PLACEHOLDER, this.name), this.targetActive);
            this.log.info(messages.ACTIVE_SET
                .replace(constants.PLACEHOLDER, this.targetActive + ""));
        }
    }

    /**
     * Check if the current active characteristic can be updated
     * @private
     */
    private canUpdateActive(): boolean {
        return this.currentActive != this.targetActive &&
            this.activeSkips == 0;
    }

    /**
     * Update current active characteristic based on the target active state
     * @private
     */
    private async updateActive(): Promise<void> {
        this.device.sendData(Buffer.from(constants.SIGNAL_ACTIVE, "hex"));
        this.currentActive = this.targetActive;
        this.activeSkips = this.currentActive ? constants.SKIPS_ACTIVE : constants.SKIPS_INACTIVE;
        this.swingModeSkips = 0;
        await this.storage.setItem(constants.STORAGE_CURRENT_ACTIVE
            .replace(constants.PLACEHOLDER, this.name), this.currentActive);
    }

    /**
     * Decrement active skips
     * @private
     */
    private doActiveSkip(): void {
        if (this.activeSkips > 0) {
            this.activeSkips--;
        }
    }

    /**
     * Initialize the rotation speed from a previous saved state or from defaults
     * @private
     */
    private async initRotationSpeed(): Promise<void> {
        this.currentRotationSpeed = await this.storage.getItem(constants.STORAGE_CURRENT_ROTATION_SPEED
            .replace(constants.PLACEHOLDER, this.name)) || constants.STEP_SIZE;
        this.targetRotationSpeed = await this.storage.getItem(constants.STORAGE_TARGET_ROTATION_SPEED
            .replace(constants.PLACEHOLDER, this.name)) || constants.STEP_SIZE;
        this.log.info(messages.ROTATION_SPEED_INIT
            .replace(constants.PLACEHOLDER, this.targetRotationSpeed + ""));
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
     * @param value value received from Homebridge
     * @private
     */
    private async setRotationSpeed(value: CharacteristicValue): Promise<void> {
        let clampedRotationSpeed = Math.max(constants.STEP_SIZE, value as number);
        if (clampedRotationSpeed != this.targetRotationSpeed) {
            this.targetRotationSpeed = clampedRotationSpeed;
            await this.storage.setItem(constants.STORAGE_TARGET_ROTATION_SPEED
                .replace(constants.PLACEHOLDER, this.name), this.targetRotationSpeed);
            this.log.info(messages.ROTATION_SPEED_SET
                .replace(constants.PLACEHOLDER, this.targetRotationSpeed + ""));
        }
    }

    /**
     * Check if the current rotation speed can be updated
     * @private
     */
    private canUpdateRotationSpeed(): boolean {
        return this.currentRotationSpeed != this.targetRotationSpeed &&
            this.currentActive == hap.Characteristic.Active.ACTIVE &&
            this.activeSkips == 0 &&
            this.swingModeSkips == 0;
    }

    /**
     * Update current rotation speed based on the target rotation speed
     * @private
     */
    private async updateRotationSpeed(): Promise<void> {
        if (this.currentRotationSpeed < this.targetRotationSpeed) {
            this.device.sendData(Buffer.from(constants.SIGNAL_ROTATION_SPEED_UP, "hex"));
            this.currentRotationSpeed += constants.STEP_SIZE;
        } else if (this.currentRotationSpeed > this.targetRotationSpeed) {
            this.device.sendData(Buffer.from(constants.SIGNAL_ROTATION_SPEED_DOWN, "hex"));
            this.currentRotationSpeed -= constants.STEP_SIZE;
        }
        await this.storage.setItem(constants.STORAGE_CURRENT_ROTATION_SPEED
            .replace(constants.PLACEHOLDER, this.name), this.currentRotationSpeed);
    }

    /**
     * Initialize the swing mode from a previous saved state or from defaults
     * @private
     */
    private async initSwingMode(): Promise<void> {
        this.currentSwingMode = await this.storage.getItem(constants.STORAGE_CURRENT_SWING_MODE
            .replace(constants.PLACEHOLDER, this.name)) || hap.Characteristic.SwingMode.SWING_DISABLED;
        this.targetSwingMode = await this.storage.getItem(constants.STORAGE_TARGET_SWING_MODE
            .replace(constants.PLACEHOLDER, this.name)) || hap.Characteristic.SwingMode.SWING_DISABLED;
        this.log.info(messages.SWING_MODE_INIT
            .replace(constants.PLACEHOLDER, this.targetSwingMode + ""));
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
     * @param value value received from Homebridge
     * @private
     */
    private async setSwingMode(value: CharacteristicValue): Promise<void> {
        if (value as number != this.targetSwingMode) {
            this.targetSwingMode = value as number;
            await this.storage.setItem(constants.STORAGE_TARGET_SWING_MODE
                .replace(constants.PLACEHOLDER, this.name), this.targetSwingMode);
            this.log.info(messages.SWING_MODE_SET
                .replace(constants.PLACEHOLDER, this.targetSwingMode + ""));
        }
    }

    /**
     * Check if the current swing mode can be updated
     * @private
     */
    private canUpdateSwingMode(): boolean {
        return this.currentSwingMode != this.targetSwingMode &&
            this.currentActive == hap.Characteristic.Active.ACTIVE &&
            this.activeSkips == 0;
    }

    /**
     * Update current swing mode based on the target swing mode
     * @private
     */
    private async updateSwingMode(): Promise<void> {
        this.device.sendData(Buffer.from(constants.SIGNAL_SWING_MODE, "hex"));
        this.currentSwingMode = this.targetSwingMode;
        this.swingModeSkips = constants.SKIPS_SWING_MODE;
        await this.storage.setItem(constants.STORAGE_CURRENT_SWING_MODE
            .replace(constants.PLACEHOLDER, this.name), this.currentSwingMode);
    }

    /**
     * Decrement swing mode skips
     * @private
     */
    private doSwingModeSkip(): void {
        if (this.swingModeSkips > 0) {
            this.swingModeSkips--;
        }
    }
}
