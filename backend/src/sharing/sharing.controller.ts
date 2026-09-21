import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AccessRecordDto, GrantAuthorizationDto, SharingService } from './sharing.service';

@Controller()
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @Get('institutions')
  institutions() {
    return this.sharingService.listInstitutions();
  }

  @Get('patients/:id/sharing')
  overview(@Param('id') id: string) {
    return this.sharingService.overview(Number(id));
  }

  @Post('patients/:id/authorizations')
  grant(@Param('id') id: string, @Body() body: GrantAuthorizationDto) {
    return this.sharingService.grant(Number(id), body);
  }

  @Post('authorizations/:id/revoke')
  revoke(@Param('id') id: string, @Body() body: { version: number }) {
    return this.sharingService.revoke(Number(id), Number(body.version));
  }

  @Post('authorizations/:id/renew')
  renew(@Param('id') id: string, @Body() body: { version: number; durationHours: number }) {
    return this.sharingService.renew(Number(id), Number(body.version), Number(body.durationHours));
  }

  @Post('patients/:id/access')
  access(@Param('id') id: string, @Body() body: AccessRecordDto) {
    return this.sharingService.access(Number(id), body);
  }
}
