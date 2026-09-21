import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AccessRecordsDto, ConsentsService, GrantConsentDto, RevokeConsentDto } from './consents.service';

@Controller()
export class ConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

  // 机构字典（授权与调阅时选择）
  @Get('institutions')
  institutions() {
    return this.consentsService.listInstitutions();
  }

  // 患者档案页：该患者的全部授权（含有效、到期、撤回历史）
  @Get('patients/:id/consents')
  consents(@Param('id', ParseIntPipe) id: number) {
    return this.consentsService.listConsents(id);
  }

  // 患者档案页：调阅记录（放行与拒绝）
  @Get('patients/:id/access-logs')
  accessLogs(@Param('id', ParseIntPipe) id: number) {
    return this.consentsService.listAccessLogs(id);
  }

  // 医生工作台：某机构当前仍有效的授权清单
  @Get('institutions/:id/active-consents')
  activeConsents(@Param('id', ParseIntPipe) id: number) {
    return this.consentsService.listActiveConsents(id);
  }

  // 患者授予/续期/变更限时授权（重复授权沿用，不生成重复授权）
  @Post('patients/:id/consents')
  grant(@Param('id', ParseIntPipe) id: number, @Body() body: GrantConsentDto) {
    return this.consentsService.grant(id, body);
  }

  // 患者撤回授权（与再次授权并发时仅一处成功）
  @Post('patients/:id/consents/revoke')
  revoke(@Param('id', ParseIntPipe) id: number, @Body() body: RevokeConsentDto) {
    return this.consentsService.revoke(id, body);
  }

  // 医生打开病历：先核验授权（有效且覆盖本次用途），再返回病历；失败同样落审计
  @Post('patients/:id/access-records')
  accessRecords(
    @Param('id', ParseIntPipe) id: number,
    @Query('purpose') purpose: string | undefined,
    @Body() body: Omit<AccessRecordsDto, 'purpose'> & { purpose?: string },
  ) {
    return this.consentsService.requestAccess(id, {
      institutionId: body.institutionId,
      doctorName: body.doctorName,
      purpose: body.purpose ?? purpose ?? '',
    });
  }
}
