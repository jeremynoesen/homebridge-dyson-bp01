# homebridge-dyson-bp01

## About
This Homebridge plugin adds a Dyson BP01 fan to HomeKit in conjunction with a BroadLink RM device.

## Purpose
There are currently plugins that can control a BroadLink RM device to control many other devices; however, they would break if you try to change more than one state of the accessory at once. This plugin solves that specifically for the Dyson Pure Cool Me.

## Required Devices
This plugin is designed to be used with the following devices:
- A BroadLink RM device supported by [this library](https://github.com/kiwi-cam/broadlinkjs-rm)
- A Dyson Pure Cool Me (BP01)

## Device Setup
### BroadLink RM Setup
1. Set up your BroadLink RM device with the BroadLink app.
2. In device properties, disable `Lock device`.
3. Place the device within line-of-sight of the Dyson's display.

### Dyson Pure Cool Me Setup
1. Set the fan speed to 1.
2. Turn off oscillation.
3. Turn off the fan itself.

## Required Software
- Node.JS v14 or greater
- Homebridge 1.0.0 or greater

## Building
You can build the project by doing the following:
- Clone or download this repository.
- run `npm run build` in the folder of the repository through the Homebridge terminal.

## Installation
There are multiple ways to install this plugin:

- Search for `homebridge-dyson-bp01` on the Homebridge plugins page, then click `Install` on this plugin.
- Run `hb-service add homebridge-dyson-bp01` through the Homebridge terminal.
- Run `npm install homebridge-dyson-bp01` through the Homebridge terminal.
- If you manually built the project, run `npm install path/to/project` through the Homebridge terminal.

After any of these, restart Homebridge.

## Configuration
To add the device to Homebridge, add the following to your accessories in the Homebridge config:
```json
{
  "accessory": "DysonBP01",
  "name": "Dyson Pure Cool Me",
  "mac": "00:00:00:00:00:00",
  "interval": 650
}
```
- The `mac` option is optional, but recommended if you have multiple BroadLink RM devices.
- The `interval` option is also optional, and it allows you to change the delay in milliseconds between each IR signal. It is recommended that you do not set this value any lower to prevent lost signals. 

After adding this, restart Homebridge for your changes to take effect.
- If no BroadLink RM device is found, the accessory will not be able to change states, and will not send signals to your Dyson Pure Cool Me.
- If one is found, you should be able to control your fan like a native HomeKit accessory.