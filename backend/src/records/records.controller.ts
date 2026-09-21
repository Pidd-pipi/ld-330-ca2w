import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreatePatientDto, RecordsService } from './records.service';

@Controller()
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get('summary')
  summary() {
    return this.recordsService.summary();
  }

  @Get('patients')
  patients(@Query('keyword') keyword?: string) {
    return this.recordsService.searchPatients(keyword);
  }

  @Post('patients')
  createPatient(@Body() body: CreatePatientDto) {
    return this.recordsService.createPatient(body);
  }

  @Get('patients/:id/timeline')
  timeline(@Param('id') id: string) {
    return this.recordsService.timeline(Number(id));
  }

  @Post('patients/:id/records')
  createRecord(@Param('id') id: string) {
    return this.recordsService.createRecord(Number(id));
  }
}
