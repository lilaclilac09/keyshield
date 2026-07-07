#!/usr/bin/env python3
"""Backward-compatible entrypoint for reflection-only dataset generation."""

from prepare_training_data import prepare_training_data

if __name__ == "__main__":
    prepare_training_data()
