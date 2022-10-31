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
 * Loop interval in milliseconds
 */
const INTERVAL = 650;

/**
 * Number of active skips after turning on the fan
 */
const SKIPS_ACTIVE = 2;

/**
 * Number of active skips after turning off the fan
 */
const SKIPS_INACTIVE = 8;

/**
 * Number of swing mode skips
 */
const SKIPS_SWING_MODE = 6;

/**
 * Number of device skips
 */
const SKIPS_DEVICE = 4;

/**
 * IR hex code used to toggle active
 */
const SIGNAL_ACTIVE = "26005800481718161916161916311817191619171816192d181918171817181719161817181718161a2e1816192d19171800066b45191631190006604817182d1a00066147151a2d190006614916192d190006604618172f18000d05";

/**
 * IR hex code used to turn up rotation speed
 */
const SIGNAL_ROTATION_SPEED_UP = "260058004718181619161917172f1817191618171817182c1919172e1618182f161916301a2d192d1817182f161817181a00066d4618182d190006614618172f1900065f4817182e1900065f4816182e180006604818172d19000d05";

/**
 * IR hex code used to turn down rotation speed
 */
const SIGNAL_ROTATION_SPEED_DOWN = "2600580047161917171719151a2d171818171619161a182d1a15173019151a2d192d1a1718161730161819161718172f1a0006664617182f1900065f4817182e18000660441917301a00065e4818172d1a00065f4618182e19000d05";

/**
 * IR hex code used to turn toggle swing mode
 */
const SIGNAL_SWING_MODE = "260058004716191517191917192c1619171816191819182d151b1916182d192e19171817182c1730181815301a2d192d160006594718192d1700066243191731180006604816192d190006604717182d190006604817182d18000d05";

/**
 * How much to increase or decrease rotation speed by
 */
const STEP_SIZE = 10;

/**
 * Node persist variable name for current active
 */
const STORAGE_CURRENT_ACTIVE = "name current active";

/**
 * Node persist variable name for target active
 */
const STORAGE_TARGET_ACTIVE = "name target active";

/**
 * Node persist variable name for current rotation speed
 */
const STORAGE_CURRENT_ROTATION_SPEED = "name current rotation speed";

/**
 * Node persist variable name for target rotation speed
 */
const STORAGE_TARGET_ROTATION_SPEED = "name target rotation speed";

/**
 * Node persist variable name for current swing mode
 */
const STORAGE_CURRENT_SWING_MODE = "name current swing mode";

/**
 * Node persist variable name for target swing mode
 */
const STORAGE_TARGET_SWING_MODE = "name target swing mode";

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
     * Used to add delays after active characteristic is updated
     * @private
     */
    private activeSkips: number;

    /**
     * Used to add delays after swing mode is updated
     * @private
     */
    private swingModeSkips: number;

    /**
     * Used to add delays after the BroadLink RM reconnects
     * @private
     */
    private deviceSkips: number;

    /**
     * Create the DysonBP01 accessory
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;

        this.name = config.name;
        this.mac = config.mac;

        this.device = null;
        this.currentActive = this.targetActive = hap.Characteristic.Active.INACTIVE;
        this.currentRotationSpeed = this.targetRotationSpeed = STEP_SIZE;
        this.currentSwingMode = this.targetSwingMode = hap.Characteristic.SwingMode.SWING_DISABLED;
        this.activeSkips = this.swingModeSkips = this.deviceSkips = 0;

        this.storage = storage.create();
        this.storage.init({dir: api.user.persistPath(), forgiveParseErrors: true});

        this.informationService = new hap.Service.AccessoryInformation();
        this.initInformationService();

        this.fanService = new hap.Service.Fanv2(config.name);
        this.initFanService();

        this.initCharacteristics().then(() => {
            this.initDevice();
            this.initLoop();
        });
    }

    /**
     * Identify the accessory through HomeKit
     */
    identify(): void {
        if (this.device == null) {
            this.log.info("Identified (BroadLink RM not connected)");
        } else {
            this.log.info("Identified (BroadLink RM connected at " + this.macToString(this.device) + ")");
        }
    }

    /**
     * Start the loop that updates the accessory characteristics
     * @private
     */
    private initLoop(): void {
        setInterval(async () => {
            if (this.device == null) {
                broadlink.discover();
            } else {
                if (await this.isDeviceConnected()) {
                    await this.updateCharacteristics();
                }
                this.doSkips();
            }
        }, INTERVAL);
    }

    /**
     * Decrement skip variables
     * @private
     */
    private doSkips(): void {
        this.doActiveSkip();
        this.doSwingModeSkip();
        this.doDeviceSkip();
    }

    /**
     * Initialize the information service for this accessory
     * @private
     */
    private initInformationService(): void {
        this.informationService
            .updateCharacteristic(hap.Characteristic.Manufacturer, "Dyson")
            .updateCharacteristic(hap.Characteristic.Model, "BP01")
            .updateCharacteristic(hap.Characteristic.SerialNumber, "Printed under machine");
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
                minStep: STEP_SIZE
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
    private initDevice(): void {
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
    private setDevice(device: any): void {
        if (this.isDeviceValid(device)) {
            this.device = device;

            this.log.info("BroadLink RM discovered!");
        }
    }

    /**
     * Check that the found BroadLink RM is valid
     * @param device BroadLink RM
     * @private
     */
    private isDeviceValid(device: any): boolean {
        return this.device == null && (!this.mac || this.macToString(device) == this.mac.toUpperCase());
    }

    /**
     * Check if the BroadLink RM is connected
     * @private
     */
    private async isDeviceConnected(): Promise<boolean> {
        let connected = await ping.promise.probe(this.device.host.address).then((res) => {
            return res.alive
        });

        if (!connected) {
            this.doDeviceReconnect();
        } else if (this.deviceSkips > 0) {
            connected = false;
        }

        return connected;
    }

    /**
     * Set the device skips
     * @private
     */
    private doDeviceReconnect(): void {
        if (this.deviceSkips == 0) {
            this.log.info("Reconnecting to BroadLink RM...");
        }

        this.deviceSkips = SKIPS_DEVICE;
    }

    /**
     * Decrement the device skips
     * @private
     */
    private doDeviceSkip(): void {
        if (this.deviceSkips > 0) {
            this.deviceSkips--;
            if (this.deviceSkips == 0) {
                this.log.info("BroadLink RM reconnected!")
            }
        }
    }

    /**
     * Convert the device MAC address to a properly formatted string
     * @param device BroadLink RM
     * @private
     */
    private macToString(device: any): string {
        return this.device.mac.toString("hex").replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase()
    }

    /**
     * Load the previous or initial characteristics of the accessory
     * @private
     */
    private async initCharacteristics(): Promise<void> {
        await this.initActive();
        await this.initRotationSpeed();
        await this.initSwingMode();
    }

    /**
     * Update the current characteristics of the accessory in the order of active, rotation speed, then swing mode
     * @private
     */
    private async updateCharacteristics(): Promise<void> {
        if (await this.canUpdateActive()) {
            await this.updateActive();
        } else if (await this.canUpdateRotationSpeedUp()) {
            await this.updateRotationSpeedUp();
        } else if (await this.canUpdateRotationSpeedDown()) {
            await this.updateRotationSpeedDown();
        } else if (await this.canUpdateSwingMode()) {
            await this.updateSwingMode();
        }
    }

    /**
     * Initialize the active characteristic, either for the first time or from the last known characteristic
     * @private
     */
    private async initActive(): Promise<void> {
        this.currentActive = await this.storage.getItem(STORAGE_CURRENT_ACTIVE
            .replace("name", this.name)) || hap.Characteristic.Active.INACTIVE;
        this.targetActive = await this.storage.getItem(STORAGE_TARGET_ACTIVE
            .replace("name", this.name)) || hap.Characteristic.Active.INACTIVE;

        this.log.info("Power is " + (this.targetActive == hap.Characteristic.Active.ACTIVE ? "ON" : "OFF"));
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
        if (value as number != this.targetActive) {
            this.targetActive = value as number;
            await this.storage.setItem(STORAGE_TARGET_ACTIVE
                .replace("name", this.name), this.targetActive);

            this.log.info("Power set to " +
                (this.targetActive == hap.Characteristic.Active.ACTIVE ? "ON" : "OFF"));
        }
    }

    /**
     * Check if the current active characteristic can be updated
     * @private
     */
    private async canUpdateActive(): Promise<boolean> {
        return this.currentActive != this.targetActive &&
            this.activeSkips == 0;
    }

    /**
     * Update current active characteristic based on the target active
     * @private
     */
    private async updateActive(): Promise<void> {
        this.device.sendData(Buffer.from(SIGNAL_ACTIVE, "hex"));
        this.currentActive = this.targetActive;
        this.activeSkips = this.targetActive ? SKIPS_ACTIVE : SKIPS_INACTIVE;
        this.swingModeSkips = 0;
        await this.storage.setItem(STORAGE_CURRENT_ACTIVE
            .replace("name", this.name), this.currentActive);
    }

    /**
     * Decrement active skips if needed
     * @private
     */
    private doActiveSkip(): void {
        if (this.activeSkips > 0) {
            this.activeSkips--;
        }
    }

    /**
     * Initialize the rotation speed, either for the first time or from the last known characteristic
     * @private
     */
    private async initRotationSpeed(): Promise<void> {
        this.currentRotationSpeed = await this.storage.getItem(STORAGE_CURRENT_ROTATION_SPEED
            .replace("name", this.name)) || STEP_SIZE;
        this.targetRotationSpeed = await this.storage.getItem(STORAGE_TARGET_ROTATION_SPEED
            .replace("name", this.name)) || STEP_SIZE;

        this.log.info("Fan speed is " + (this.targetRotationSpeed / STEP_SIZE));
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
        if (value as number != this.targetRotationSpeed) {
            this.targetRotationSpeed = Math.max(STEP_SIZE, value as number);
            await this.storage.setItem(STORAGE_TARGET_ROTATION_SPEED
                .replace("name", this.name), this.targetRotationSpeed);

            this.log.info("Fan speed set to " + (this.targetRotationSpeed / STEP_SIZE));
        }
    }

    /**
     * Check if the current rotation speed can be increased
     * @private
     */
    private async canUpdateRotationSpeedUp(): Promise<boolean> {
        return this.currentRotationSpeed < this.targetRotationSpeed &&
            this.currentActive == hap.Characteristic.Active.ACTIVE &&
            this.activeSkips == 0 &&
            this.swingModeSkips == 0;
    }

    /**
     * Increase current rotation speed based on the target rotation speed
     * @private
     */
    private async updateRotationSpeedUp(): Promise<void> {
        this.device.sendData(Buffer.from(SIGNAL_ROTATION_SPEED_UP, "hex"));
        this.currentRotationSpeed += STEP_SIZE;
        await this.storage.setItem(STORAGE_CURRENT_ROTATION_SPEED
            .replace("name", this.name), this.currentRotationSpeed);
    }

    /**
     * Check if the current rotation speed can be decreased
     * @private
     */
    private async canUpdateRotationSpeedDown(): Promise<boolean> {
        return this.currentRotationSpeed > this.targetRotationSpeed &&
            this.currentActive == hap.Characteristic.Active.ACTIVE &&
            this.activeSkips == 0 &&
            this.swingModeSkips == 0;
    }

    /**
     * Decrease current rotation speed based on the target rotation speed
     * @private
     */
    private async updateRotationSpeedDown(): Promise<void> {
        this.device.sendData(Buffer.from(SIGNAL_ROTATION_SPEED_DOWN, "hex"));
        this.currentRotationSpeed -= STEP_SIZE;
        await this.storage.setItem(STORAGE_CURRENT_ROTATION_SPEED
            .replace("name", this.name), this.currentRotationSpeed);
    }

    /**
     * Initialize the swing mode, either for the first time or from the last known characteristic
     * @private
     */
    private async initSwingMode(): Promise<void> {
        this.currentSwingMode = await this.storage.getItem(STORAGE_CURRENT_SWING_MODE
            .replace("name", this.name)) || hap.Characteristic.SwingMode.SWING_DISABLED;
        this.targetSwingMode = await this.storage.getItem(STORAGE_TARGET_SWING_MODE
                .replace("name", this.name)) || hap.Characteristic.SwingMode.SWING_DISABLED;

        this.log.info("Oscillation is " +
            (this.targetSwingMode == hap.Characteristic.SwingMode.SWING_ENABLED ? "ON" : "OFF"));
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
        if (value as number != this.targetSwingMode) {
            this.targetSwingMode = value as number;
            await this.storage.setItem(STORAGE_TARGET_SWING_MODE
                .replace("name", this.name), this.targetSwingMode);

            this.log.info("Oscillation set to " +
                (this.targetSwingMode == hap.Characteristic.SwingMode.SWING_ENABLED ? "ON" : "OFF"));
        }
    }

    /**
     * Check if the current swing mode can be updated
     * @private
     */
    private async canUpdateSwingMode(): Promise<boolean> {
        return this.currentSwingMode != this.targetSwingMode &&
            this.currentActive == hap.Characteristic.Active.ACTIVE &&
            this.activeSkips == 0;
    }

    /**
     * Update current swing mode based on the target swing mode
     * @private
     */
    private async updateSwingMode(): Promise<void> {
        this.device.sendData(Buffer.from(SIGNAL_SWING_MODE, "hex"));
        this.currentSwingMode = this.targetSwingMode;
        this.swingModeSkips = SKIPS_SWING_MODE;
        await this.storage.setItem(STORAGE_CURRENT_SWING_MODE
            .replace("name", this.name), this.currentSwingMode);
    }

    /**
     * Decrement swing mode skips if needed
     * @private
     */
    private doSwingModeSkip(): void {
        if (this.swingModeSkips > 0) {
            this.swingModeSkips--;
        }
    }
}
