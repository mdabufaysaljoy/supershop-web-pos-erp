import mongoose, { Schema } from 'mongoose';

const exportJobSchema = new Schema(
  {
    resource: {
      type: String,
      required: true,
      index: true,
    },
    format: {
      type: String,
      enum: ['xlsx', 'csv', 'json'],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'done', 'failed'],
      default: 'queued',
      index: true,
    },
    title: {
      type: String,
      default: null,
    },
    columns: {
      type: [String],
      default: [],
    },
    filters: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    sort: {
      type: Schema.Types.Mixed,
      default: null,
    },
    fileName: {
      type: String,
      required: true,
    },
    resultKey: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    counts: {
      rows: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    failure: {
      type: String,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

const reportPresetSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    resource: {
      type: String,
      required: true,
      index: true,
    },
    columns: {
      type: [String],
      required: true,
    },
    filters: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    format: {
      type: String,
      enum: ['xlsx', 'csv', 'json'],
      default: 'xlsx',
    },
    sort: {
      type: Schema.Types.Mixed,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

export const ExportJob = mongoose.model('ExportJob', exportJobSchema, 'export_jobs');
export const ReportPreset = mongoose.model('ReportPreset', reportPresetSchema, 'report_presets');
