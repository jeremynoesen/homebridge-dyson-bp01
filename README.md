# homebridge-dyson-bp01

## About
This Homebridge plugin adds a Dyson BP01 fan to HomeKit in conjuntion with a Broadlink RM device.

## Purpose
There are currently plugins that can control a Broadlink RM device to control many other devices; however, they would break if you try to change more than one state of the accessory at once. This plugin solves that specifically for the Dyson Pure Cool Me.

## Required Hardware
- A Dyson Pure Cool Me (BP01)
- A Broadlink RM device supported by [this library](https://github.com/kiwi-cam/broadlinkjs-rm)

## Installation
- Clone or download this repository
- Run `npm install path/to/repo`
- Restart Homebridge

## Configuration
To add the device to Homebridge, add the following to your accessories in the Homebridge config:
```json
{
  "accessory": "DysonBP01",
  "name": "Dyson Pure Cool Me"
}
```